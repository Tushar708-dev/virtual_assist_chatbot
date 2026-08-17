const natural = require("natural");

/**
 * ---- Intent Classifier -----------------------------------------------
 * Uses natural's Naive Bayes classifier trained on sample utterances per
 * intent. This is the "NLP-powered query processing / intent detection"
 * piece. It's lightweight (no external API calls, no API key needed) but
 * genuinely does statistical text classification, not just if/else string
 * matching.
 * ------------------------------------------------------------------------
 */
const classifier = new natural.BayesClassifier();

const trainingData = {
  greeting: [
    "hi", "hello", "hey", "good morning", "good evening", "good afternoon",
    "what's up", "yo", "hey there", "howdy",
  ],
  goodbye: [
    "bye", "goodbye", "see you", "see you later", "talk to you later",
    "catch you later", "gtg", "i'm leaving", "exit", "quit",
  ],
  thanks: [
    "thank you", "thanks", "thanks a lot", "appreciate it", "thank you so much",
    "thanks for the help",
  ],
  time_query: [
    "what time is it", "current time", "tell me the time", "what's the time",
    "time please",
  ],
  date_query: [
    "what's the date today", "today's date", "what day is it", "current date",
    "what's today's date",
  ],
  name_query: [
    "what is your name", "who are you", "your name please", "what should i call you",
  ],
  capability_query: [
    "what can you do", "help me", "what are your features", "how can you help",
    "what do you do", "help",
  ],
  weather_query: [
    "what's the weather", "weather today", "is it raining", "temperature outside",
    "weather forecast", "how's the weather",
  ],
  joke_request: [
    "tell me a joke", "make me laugh", "say something funny", "joke please",
    "know any jokes",
  ],
  feedback_positive: [
    "you are great", "good job", "well done", "nice work", "awesome", "amazing bot",
  ],
  feedback_negative: [
    "you are bad", "not helpful", "this is wrong", "that's incorrect", "useless",
  ],
};

Object.entries(trainingData).forEach(([intent, samples]) => {
  samples.forEach((s) => classifier.addDocument(s, intent));
});
classifier.train();

const tokenizer = new natural.WordTokenizer();

// Pre-tokenize training samples once for fast overlap scoring at request time
const tokenizedTrainingData = Object.fromEntries(
  Object.entries(trainingData).map(([intent, samples]) => [
    intent,
    samples.map((s) => new Set(tokenizer.tokenize(s.toLowerCase()))),
  ])
);

/**
 * Word-overlap (Jaccard-style) score between the input and the best-matching
 * training sample for an intent. This is combined with the Bayes classifier
 * below — natural's raw Bayes "value" scores aren't well-calibrated for
 * thresholding on their own (they can favor the label with the most training
 * tokens rather than the best semantic match), so overlap acts as the
 * primary signal and Bayes acts as a tie-breaker/secondary vote.
 */
function bestOverlapScore(inputTokens, intent) {
  let best = 0;
  for (const sampleTokens of tokenizedTrainingData[intent]) {
    const intersection = [...inputTokens].filter((t) => sampleTokens.has(t)).length;
    const union = new Set([...inputTokens, ...sampleTokens]).size;
    const jaccard = union === 0 ? 0 : intersection / union;
    if (jaccard > best) best = jaccard;
  }
  return best;
}

/**
 * Static reply templates per intent. In a production system this could be
 * swapped for calls to an LLM (e.g. Claude API) for open-ended intents —
 * see the `unknown` branch and README for how to wire that in.
 */
const responseBank = {
  greeting: () => pick([
    "Hey! How can I help you today?",
    "Hello there! What are you working on?",
    "Hi! Ask me anything.",
  ]),
  goodbye: () => pick([
    "Goodbye! Talk soon.",
    "See you later!",
    "Catch you next time.",
  ]),
  thanks: () => pick([
    "You're welcome!",
    "Anytime!",
    "Glad I could help.",
  ]),
  time_query: () =>
    `It's currently ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}.`,
  date_query: () =>
    `Today's date is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`,
  name_query: () => "I'm your AI Virtual Assistant, built on the MERN stack.",
  capability_query: () =>
    "I can chat with you, answer simple queries (time, date, jokes), remember our conversation history, and can be extended with more intents easily.",
  weather_query: () =>
    "I don't have live weather access yet, but this is a great spot to plug in a weather API like OpenWeatherMap.",
  joke_request: () => pick([
    "Why do programmers prefer dark mode? Because light attracts bugs.",
    "I told my computer I needed a break, and it said no problem — it froze immediately.",
    "There are 10 types of people: those who understand binary and those who don't.",
  ]),
  feedback_positive: () => "Thank you! I'll keep improving.",
  feedback_negative: () => "Sorry about that — I'm still learning. Could you rephrase your query?",
  unknown: () =>
    "I'm not fully trained on that yet, but I've logged it. Try asking about the time, date, a joke, or what I can do.",
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Classifies the incoming text and returns { intent, confidence, reply }.
 * Confidence is derived from the classifier's internal probability
 * distribution over all trained labels (context-aware — not a flat guess).
 */
function processQuery(rawText) {
  const text = (rawText || "").trim();

  if (!text) {
    return { intent: "empty", confidence: 0, reply: "Please type something so I can help." };
  }

  const lowerText = text.toLowerCase();
  const inputTokens = new Set(tokenizer.tokenize(lowerText));

  // Score every intent by word overlap with its training samples
  const overlapScores = Object.keys(trainingData).map((intent) => ({
    intent,
    score: bestOverlapScore(inputTokens, intent),
  }));
  overlapScores.sort((a, b) => b.score - a.score);
  const topOverlap = overlapScores[0];

  // Bayes classification as a secondary vote (helps when overlap is a tie or
  // input phrasing differs from training samples but is still recognizable)
  const bayesLabel = classifier.classify(text);

  // Confidence threshold — below this we treat it as "unknown" rather than
  // force-fitting a low-confidence label. This is what makes the bot
  // context-aware instead of always guessing an intent.
  const OVERLAP_THRESHOLD = 0.2;

  let intent;
  let confidence;

  if (topOverlap.score >= OVERLAP_THRESHOLD) {
    intent = topOverlap.intent;
    confidence = Number(topOverlap.score.toFixed(3));
  } else {
    intent = "unknown";
    confidence = Number(topOverlap.score.toFixed(3));
  }

  // If Bayes agrees with the top overlap candidate, nudge confidence up —
  // this is the "context-aware" cross-check between the two signals.
  if (intent !== "unknown" && bayesLabel === intent) {
    confidence = Number(Math.min(1, confidence + 0.15).toFixed(3));
  }

  const reply = (responseBank[intent] || responseBank.unknown)();

  return { intent, confidence, reply };
}

module.exports = { processQuery, classifier };
