// Fake NYT Mini data – replace with real puzzle later

export function loadPuzzle() {
  const cells = Array(25).fill(null);

  const answers = "TABHOMERAPPLEYIELDCDS".split("");

  // define cell indices used
  const activeCells = [
    0, 1, 2,       // TAB
    5, 6, 7, 8, 9, // HOMER
    10,11,12,13,14,// APPLE
    15,16,17,18,19,// YIELD
    21,22,23       // CDS
  ];

  activeCells.forEach((idx, i) => {
    cells[idx] = { answer: answers[i], label: null };
  });

  // Optional labels for clue starts
  cells[0].label = "1";
  cells[5].label = "4";
  cells[10].label = "6";
  cells[15].label = "7";
  cells[21].label = "8";

  const clues = [
    { label: "1", direction: "Across", clue: "Key above Caps Lock" },
    { label: "4", direction: "Across", clue: "Biased sports fan" },
    { label: "6", direction: "Across", clue: "What puts the \"i\" in Silicon Valley?" },
    { label: "7", direction: "Across", clue: "Triangular road sign" },
    { label: "8", direction: "Across", clue: "Items in a music library, for short" },

    { label: "1", direction: "Down", clue: "Conversation subject" },
    { label: "2", direction: "Down", clue: "Pumped up" },
    { label: "3", direction: "Down", clue: "\"Silver ___\" (Christmas classic)" },
    { label: "4", direction: "Down", clue: "Farm fodder" },
    { label: "5", direction: "Down", clue: "Like pants in the classic Nantucket style" }
  ];

  return { clues, cells };
}
