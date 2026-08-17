import { translateOpeningName } from "./openings";

export type Locale = "en" | "zh";

const messages = {
  en: {
    appTitle: "Chess Opening Trainer",
    appSubtitle: "Study room mode: focused opening practice",
    settings: "Settings",
    newGame: "New Game",
    undo: "Undo",
    explore: "Explore",
    engineThinking: "Engine is thinking...",
    startBySelecting: "Start by selecting an opening line.",
    accuracy: "Accuracy",
    punishments: "punishments",
    moveHistory: "Move History",
    white: "White",
    black: "Black",
    inBook: "In Book",
    freePlay: "Free Play",
    punishment: "Punishment",
    bookChoices: "Book Choices",
    computerWillPlay: "Computer will play",
    punishmentLine: "Punishment Line",
    focusMove: "Focus move",
    unchartedPosition: "Uncharted Position",
    eval: "Eval",
    startNewDrill: "Start New Drill",
    close: "Close",
    searchOpenings: "Search openings (e.g. sicilian dragon)",
    selection: "Selection",
    noVariationSelected: "No variation selected (full book).",
    playAs: "Play as",
    startFromMove: "Start from move",
    punishmentDepth: "Punishment depth",
    evalThreshold: "Eval threshold",
    startDrilling: "Start Drilling!",
    openingUnknown: "Unknown / Out of book",
    startingPosition: "Starting Position",
    concretePunishmentOver: "Concrete punishment is over. Switching back to normal play.",
    memory: "Memory",
    openingProgress: "Opening Progress",
    repeatedTrainerMoves: "Repeated Trainer Moves",
    playableMoves: "Playable Moves",
    recentMistakes: "Recent Mistakes",
    noMemoryYet: "No practice data yet.",
    noRepeatedMoves: "No repeated trainer moves yet.",
    noPlayableMoves: "No playable deviations stored yet.",
    noMistakesStored: "No mistakes stored yet.",
    sessions: "sessions",
    moves: "moves",
    mistakes: "mistakes",
    discardGameConfirm: "Switching sides starts a new game and discards the current one. Continue?",
  },
  zh: {
    appTitle: "\u56fd\u9645\u8c61\u68cb\u5f00\u5c40\u8bad\u7ec3\u5668",
    appSubtitle: "\u4e66\u623f\u6a21\u5f0f\uff1a\u4e13\u6ce8\u4e8e\u5f00\u5c40\u8bad\u7ec3",
    settings: "\u8bbe\u7f6e",
    newGame: "\u65b0\u5bf9\u5c40",
    undo: "\u6094\u68cb",
    explore: "\u63a2\u7d22",
    engineThinking: "\u5f15\u64ce\u601d\u8003\u4e2d...",
    startBySelecting: "\u5148\u9009\u62e9\u4e00\u4e2a\u5f00\u5c40\u7ebf\u8def\u5f00\u59cb\u8bad\u7ec3\u3002",
    accuracy: "\u51c6\u786e\u7387",
    punishments: "\u60e9\u7f5a\u6b21\u6570",
    moveHistory: "\u7740\u6cd5\u8bb0\u5f55",
    white: "\u767d\u65b9",
    black: "\u9ed1\u65b9",
    inBook: "\u5e93\u5185",
    freePlay: "\u81ea\u7531\u5bf9\u5c40",
    punishment: "\u60e9\u7f5a\u6a21\u5f0f",
    bookChoices: "\u5e93\u5185\u5019\u9009\u7740\u6cd5",
    computerWillPlay: "\u7535\u8111\u51c6\u5907\u4e0b",
    punishmentLine: "\u60e9\u7f5a\u7ebf\u8def",
    focusMove: "\u5f53\u524d\u805a\u7126",
    unchartedPosition: "\u672a\u547d\u540d\u5c40\u9762",
    eval: "\u5c40\u9762\u8bc4\u4f30",
    startNewDrill: "\u5f00\u59cb\u65b0\u8bad\u7ec3",
    close: "\u5173\u95ed",
    searchOpenings: "\u641c\u7d22\u5f00\u5c40\uff08\u4f8b\u5982\uff1a\u897f\u897f\u91cc \u9f99\u5f0f\uff09",
    selection: "\u5f53\u524d\u9009\u62e9",
    noVariationSelected: "\u672a\u9009\u62e9\u5177\u4f53\u53d8\u4f8b\uff08\u4f7f\u7528\u5b8c\u6574\u5f00\u5c40\u5e93\uff09\u3002",
    playAs: "\u6267\u5b50\u989c\u8272",
    startFromMove: "\u4ece\u7b2c\u51e0\u56de\u5408\u5f00\u59cb",
    punishmentDepth: "\u60e9\u7f5a\u6df1\u5ea6",
    evalThreshold: "\u8bc4\u4f30\u9608\u503c",
    startDrilling: "\u5f00\u59cb\u8bad\u7ec3",
    openingUnknown: "\u672a\u77e5 / \u5df2\u8131\u8c31",
    startingPosition: "\u8d77\u59cb\u5c40\u9762",
    concretePunishmentOver: "\u5177\u4f53\u60e9\u7f5a\u5df2\u7ecf\u7ed3\u675f\uff0c\u5207\u56de\u6b63\u5e38\u5bf9\u5f08\u3002",
    memory: "\u8bad\u7ec3\u8bb0\u5fc6",
    openingProgress: "\u5f00\u5c40\u8fdb\u5ea6",
    repeatedTrainerMoves: "\u91cd\u590d\u51fa\u73b0\u7684\u6559\u7ec3\u7740\u6cd5",
    playableMoves: "\u53ef\u4e0b\u7684\u504f\u79bb\u7740\u6cd5",
    recentMistakes: "\u6700\u8fd1\u9519\u8bef",
    noMemoryYet: "\u8fd8\u6ca1\u6709\u8bad\u7ec3\u6570\u636e\u3002",
    noRepeatedMoves: "\u8fd8\u6ca1\u6709\u91cd\u590d\u7684\u6559\u7ec3\u7740\u6cd5\u3002",
    noPlayableMoves: "\u8fd8\u6ca1\u6709\u8bb0\u5f55\u53ef\u4e0b\u7684\u504f\u79bb\u7740\u6cd5\u3002",
    noMistakesStored: "\u8fd8\u6ca1\u6709\u8bb0\u5f55\u9519\u8bef\u3002",
    sessions: "\u6b21\u8bad\u7ec3",
    moves: "\u6b65",
    mistakes: "\u9519\u8bef",
    discardGameConfirm: "\u4ea4\u6362\u6267\u68cb\u65b9\u4f1a\u5f00\u59cb\u65b0\u5bf9\u5c40\u5e76\u653e\u5f03\u5f53\u524d\u5bf9\u5c40\u3002\u7ee7\u7eed\u5417\uff1f",
  },
} as const;

export function t(locale: Locale, key: keyof (typeof messages)["en"]): string {
  return messages[locale][key];
}

export function localizeCoachMessage(message: string, locale: Locale): string {
  if (locale === "en") {
    return message;
  }

  if (message === "Opening trainer ready.") {
    return "\u5f00\u5c40\u8bad\u7ec3\u5668\u5df2\u5c31\u7eea\u3002";
  }
  if (message === "Out of book. Engine takes over.") {
    return "\u5df2\u8131\u79bb\u5f00\u5c40\u5e93\uff0c\u5f15\u64ce\u63a5\u7ba1\u3002";
  }
  if (message === "Game over.") {
    return "\u5bf9\u5c40\u7ed3\u675f\u3002";
  }
  if (message === "Out of book now. Playing best engine moves.") {
    return "\u73b0\u5728\u5df2\u7ecf\u8131\u8c31\uff0c\u5f00\u59cb\u6309\u5f15\u64ce\u6700\u4f73\u7740\u6cd5\u884c\u68cb\u3002";
  }
  if (message === "Undid last full move.") {
    return "\u5df2\u6094\u68cb\u4e00\u4e2a\u5b8c\u6574\u56de\u5408\u3002";
  }
  if (message === "Concrete punishment is over. Switching back to normal play.") {
    return t(locale, "concretePunishmentOver");
  }
  if (message === "Explore mode. Move either side freely and watch the engine evaluation update.") {
    return "\u63a2\u7d22\u6a21\u5f0f\u3002\u53ef\u4ee5\u81ea\u7531\u79fb\u52a8\u4efb\u610f\u4e00\u65b9\u7684\u5408\u6cd5\u7740\u6cd5\uff0c\u540c\u65f6\u89c2\u5bdf\u5f15\u64ce\u8bc4\u4f30\u7684\u53d8\u5316\u3002";
  }
  if (message === "Explore mode. This position is still in book.") {
    return "\u63a2\u7d22\u6a21\u5f0f\u3002\u8fd9\u4e2a\u5c40\u9762\u4ecd\u5728\u5f00\u5c40\u5e93\u4e2d\u3002";
  }
  if (message === "Explore mode. Engine evaluation is following this branch.") {
    return "\u63a2\u7d22\u6a21\u5f0f\u3002\u5f15\u64ce\u6b63\u5728\u8ddf\u8e2a\u8fd9\u6761\u53d8\u5316\u7684\u8bc4\u4f30\u3002";
  }

  const followingMatch = message.match(/^Following opening theory: (.+)\.$/);
  if (followingMatch) {
    return `\u6b63\u5728\u9075\u5faa\u5f00\u5c40\u7406\u8bba\uff1a${translateOpeningName(followingMatch[1], locale) ?? followingMatch[1]}\u3002`;
  }

  const openingFinishedMatch = message.match(
    /^Opening finished with (.+)\. (.+) ends here, so the engine will continue from this position\.$/,
  );
  if (openingFinishedMatch) {
    return `\u5f00\u5c40\u7ebf\u4ee5 ${openingFinishedMatch[1]} \u7ed3\u675f\u3002${translateOpeningName(
      openingFinishedMatch[2],
      locale,
    ) ?? openingFinishedMatch[2]}\u7684\u5df2\u5b58\u7ebf\u8def\u5230\u6b64\u4e3a\u6b62\uff0c\u63a5\u4e0b\u6765\u5c06\u7531\u5f15\u64ce\u7ee7\u7eed\u8d70\u5b50\u3002`;
  }

  const openingFinishedGenericMatch = message.match(
    /^Opening finished with (.+)\. The stored line ends here, so the engine will continue from this position\.$/,
  );
  if (openingFinishedGenericMatch) {
    return `\u5f00\u5c40\u7ebf\u4ee5 ${openingFinishedGenericMatch[1]} \u7ed3\u675f\u3002\u5df2\u5b58\u7ebf\u8def\u5230\u6b64\u4e3a\u6b62\uff0c\u63a5\u4e0b\u6765\u5c06\u7531\u5f15\u64ce\u7ee7\u7eed\u8d70\u5b50\u3002`;
  }

  const goodMoveMatch = message.match(/^Good move\. Still in book: (.+)\.$/);
  if (goodMoveMatch) {
    return `\u597d\u68cb\u3002\u4ecd\u5728\u5f00\u5c40\u5e93\u4e2d\uff1a${translateOpeningName(goodMoveMatch[1], locale) ?? goodMoveMatch[1]}\u3002`;
  }

  const slightMatch = message.match(/^Slight inaccuracy\. Best was (.+)\.$/);
  if (slightMatch) {
    return `\u8fd9\u662f\u8f7b\u5fae\u4e0d\u51c6\u786e\u3002\u6700\u4f73\u7740\u6cd5\u662f ${slightMatch[1]}\u3002`;
  }

  const detailedSlightMatch = message.match(
    /^Slight inaccuracy\. After (.+), you are about (.+) worse because (.+)\. Best was (.+)\.$/,
  );
  if (detailedSlightMatch) {
    return `\u8fd9\u662f\u8f7b\u5fae\u4e0d\u51c6\u786e\u3002\u5728 ${localizeReasonFragments(
      detailedSlightMatch[1],
      locale,
    )} \u4e4b\u540e\uff0c\u4f60\u7684\u5c40\u9762\u5927\u7ea6\u5dee\u4e86 ${detailedSlightMatch[2]}\uff0c\u539f\u56e0\u662f${localizeReasonFragments(
      detailedSlightMatch[3],
      locale,
    )}\u3002\u6700\u4f73\u7740\u6cd5\u662f ${detailedSlightMatch[4]}\u3002`;
  }

  const punishableMatch = message.match(/^That was a punishable mistake\. (.+)$/);
  if (punishableMatch) {
    return `\u8fd9\u662f\u53ef\u4ee5\u88ab\u5177\u4f53\u60e9\u7f5a\u7684\u9519\u8bef\u3002${localizeCoachMessage(punishableMatch[1], locale)}`;
  }

  const detailedPunishableMatch = message.match(
    /^That is punishable\. After (.+), you end up about (.+) of material down because (.+)\. Best was (.+)\.$/,
  );
  if (detailedPunishableMatch) {
    return `\u8fd9\u6b65\u68cb\u53ef\u4ee5\u88ab\u5177\u4f53\u60e9\u7f5a\u3002\u5728 ${localizeReasonFragments(
      detailedPunishableMatch[1],
      locale,
    )} \u4e4b\u540e\uff0c\u4f60\u5927\u7ea6\u4f1a\u51c0\u4e8f ${detailedPunishableMatch[2]}\u5b50\u529b\uff0c\u539f\u56e0\u662f${localizeReasonFragments(
      detailedPunishableMatch[3],
      locale,
    )}\u3002\u6700\u4f73\u7740\u6cd5\u662f ${detailedPunishableMatch[4]}\u3002`;
  }

  const matingPunishableMatch = message.match(
    /^That is punishable\. After (.+), you are facing a forced mate because (.+)\. Best was (.+)\.$/,
  );
  if (matingPunishableMatch) {
    return `\u8fd9\u6b65\u68cb\u53ef\u4ee5\u88ab\u5177\u4f53\u60e9\u7f5a\u3002\u5728 ${localizeReasonFragments(
      matingPunishableMatch[1],
      locale,
    )} \u4e4b\u540e\uff0c\u4f60\u5c06\u9762\u4e34\u5f3a\u5236\u5c06\u6740\uff0c\u539f\u56e0\u662f${localizeReasonFragments(
      matingPunishableMatch[2],
      locale,
    )}\u3002\u6700\u4f73\u7740\u6cd5\u662f ${matingPunishableMatch[3]}\u3002`;
  }

  const matingInPunishableMatch = message.match(
    /^That is punishable\. After (.+), you are facing mate in (\d+) because (.+)\. Best was (.+)\.$/,
  );
  if (matingInPunishableMatch) {
    return `\u8fd9\u6b65\u68cb\u53ef\u4ee5\u88ab\u5177\u4f53\u60e9\u7f5a\u3002\u5728 ${localizeReasonFragments(
      matingInPunishableMatch[1],
      locale,
    )} \u4e4b\u540e\uff0c\u4f60\u5c06\u9762\u4e34 ${matingInPunishableMatch[2]} \u6b65\u5c06\u6740\uff0c\u539f\u56e0\u662f${localizeReasonFragments(
      matingInPunishableMatch[3],
      locale,
    )}\u3002\u6700\u4f73\u7740\u6cd5\u662f ${matingInPunishableMatch[4]}\u3002`;
  }

  const continueMatch = message.match(/^Continuing punishment\. Position remains concretely worse \((.+)\)\.$/);
  if (continueMatch) {
    return `\u7ee7\u7eed\u60e9\u7f5a\u3002\u4f60\u7684\u5c40\u9762\u4ecd\u7136\u5b58\u5728\u5177\u4f53\u52a3\u52bf\uff08${continueMatch[1]}\uff09\u3002`;
  }

  const outOfBookAlternativesMatch = message.match(/^That move leaves book\. Book alternatives: (.+)\.$/);
  if (outOfBookAlternativesMatch) {
    return `\u8fd9\u6b65\u68cb\u4f7f\u4f60\u8131\u79bb\u5f00\u5c40\u5e93\u3002\u53ef\u4ee5\u8003\u8651\u7684\u5e93\u5185\u66ff\u4ee3\u7740\u6cd5\uff1a${localizeAlternativeList(
      outOfBookAlternativesMatch[1],
    )}\u3002`;
  }

  const playableOutsideLineMatch = message.match(
    /^(.+) is a playable move, but it does not stay in (.+)\.(?: It is steering the game toward (.+) instead\.)? To stay in that line, (?:play|choose) (.+)\.$/,
  );
  if (playableOutsideLineMatch) {
    const resultingOpening = playableOutsideLineMatch[3]
      ? `\u5b83\u4f1a\u628a\u5bf9\u5c40\u5f15\u5411 ${translateOpeningName(playableOutsideLineMatch[3], locale) ?? playableOutsideLineMatch[3]}\u3002`
      : "";
    return `${playableOutsideLineMatch[1]} \u8fd9\u6b65\u68cb\u53ef\u4ee5\u4e0b\uff0c\u4f46\u5b83\u4e0d\u5728 ${translateOpeningName(
      playableOutsideLineMatch[2],
      locale,
    ) ?? playableOutsideLineMatch[2]} \u7684\u8bad\u7ec3\u7ebf\u91cc\u3002${resultingOpening} \u82e5\u60f3\u7559\u5728\u8fd9\u6761\u7ebf\u91cc\uff0c\u8bf7\u4e0b ${playableOutsideLineMatch[4]}\u3002`;
  }

  const leavesLineMatch = message.match(
    /^(.+) leaves (.+)\.(?: It is steering the game toward (.+) instead\.)? To stay in that line, (?:play|choose) (.+)\.$/,
  );
  if (leavesLineMatch) {
    const resultingOpening = leavesLineMatch[3]
      ? `\u5b83\u4f1a\u628a\u5bf9\u5c40\u5f15\u5411 ${translateOpeningName(leavesLineMatch[3], locale) ?? leavesLineMatch[3]}\u3002`
      : "";
    return `${leavesLineMatch[1]} \u8fd9\u6b65\u68cb\u4f1a\u79bb\u5f00 ${translateOpeningName(
      leavesLineMatch[2],
      locale,
    ) ?? leavesLineMatch[2]}\u3002${resultingOpening} \u82e5\u60f3\u7559\u5728\u8fd9\u6761\u7ebf\u91cc\uff0c\u8bf7\u4e0b ${leavesLineMatch[4]}\u3002`;
  }

  const toleratedMatch = message.match(/^(.+) is within the tolerated eval drop\.$/);
  if (toleratedMatch) {
    return `${toleratedMatch[1]} \u7684\u8bc4\u4f30\u4e0b\u964d\u4ecd\u5728\u5bb9\u5fcd\u8303\u56f4\u5185\u3002`;
  }

  const allowsMatch = message.match(/^(.+) allows concrete punishment within (\d+) plies\.$/);
  if (allowsMatch) {
    return `${allowsMatch[1]} \u4f1a\u5728 ${allowsMatch[2]} \u4e2a\u534a\u56de\u5408\u5185\u906d\u5230\u5177\u4f53\u60e9\u7f5a\u3002`;
  }

  const noForceMatch = message.match(/^(.+) drops eval but does not force concrete loss within (\d+) plies\.$/);
  if (noForceMatch) {
    return `${noForceMatch[1]} \u867d\u7136\u8ba9\u8bc4\u4f30\u4e0b\u964d\uff0c\u4f46\u5728 ${noForceMatch[2]} \u4e2a\u534a\u56de\u5408\u5185\u8fd8\u4e0d\u4f1a\u88ab\u5f3a\u5236\u9020\u6210\u5177\u4f53\u635f\u5931\u3002`;
  }

  const matingSlightMatch = message.match(
    /^Slight inaccuracy\. After (.+), you are facing a forced mate because (.+)\. Best was (.+)\.$/,
  );
  if (matingSlightMatch) {
    return `\u8fd9\u662f\u8f7b\u5fae\u4e0d\u51c6\u786e\u3002\u5728 ${localizeReasonFragments(
      matingSlightMatch[1],
      locale,
    )} \u4e4b\u540e\uff0c\u4f60\u5c06\u9762\u4e34\u5f3a\u5236\u5c06\u6740\uff0c\u539f\u56e0\u662f${localizeReasonFragments(
      matingSlightMatch[2],
      locale,
    )}\u3002\u6700\u4f73\u7740\u6cd5\u662f ${matingSlightMatch[3]}\u3002`;
  }

  const matingInSlightMatch = message.match(
    /^Slight inaccuracy\. After (.+), you are facing mate in (\d+) because (.+)\. Best was (.+)\.$/,
  );
  if (matingInSlightMatch) {
    return `\u8fd9\u662f\u8f7b\u5fae\u4e0d\u51c6\u786e\u3002\u5728 ${localizeReasonFragments(
      matingInSlightMatch[1],
      locale,
    )} \u4e4b\u540e\uff0c\u4f60\u5c06\u9762\u4e34 ${matingInSlightMatch[2]} \u6b65\u5c06\u6740\uff0c\u539f\u56e0\u662f${localizeReasonFragments(
      matingInSlightMatch[3],
      locale,
    )}\u3002\u6700\u4f73\u7740\u6cd5\u662f ${matingInSlightMatch[4]}\u3002`;
  }

  return message;
}

function localizeAlternativeList(text: string): string {
  return text
    .replaceAll("(better: ", "(\u66f4\u597d\uff1a")
    .replaceAll("(similar: ", "(\u76f8\u8fd1\uff1a")
    .replaceAll("(sharper: ", "(\u66f4\u5c16\u9510\uff1a")
    .replaceAll("it avoids leaving material loose", "\u5b83\u907f\u514d\u4e86\u5b50\u529b\u677e\u6563")
    .replaceAll("it keeps more central control", "\u5b83\u4fdd\u7559\u4e86\u66f4\u591a\u4e2d\u5fc3\u63a7\u5236")
    .replaceAll("it develops more naturally", "\u5b83\u7684\u51fa\u5b50\u66f4\u81ea\u7136")
    .replaceAll(
      "it keeps the structure closer to the book position",
      "\u5b83\u8ba9\u5c40\u9762\u7ed3\u6784\u66f4\u63a5\u8fd1\u5f00\u5c40\u5e93",
    )
    .replaceAll(" and ", "\u4e14");
}

function localizeReasonFragments(text: string, locale: Locale): string {
  if (locale === "en") {
    return text;
  }

  return text
    .replace("the likely continuation is ", "\u53ef\u80fd\u51fa\u73b0\u7684\u7ee7\u7eed\u7740\u6cd5\u662f ")
    .replace("you left your queen hanging", "\u4f60\u7684\u540e\u5b50\u5904\u4e8e\u63c2\u5b50\u72b6\u6001")
    .replace("you left your rook hanging", "\u4f60\u7684\u8f66\u5904\u4e8e\u63c2\u5b50\u72b6\u6001")
    .replace("you left your bishop hanging", "\u4f60\u7684\u8c61\u5904\u4e8e\u63c2\u5b50\u72b6\u6001")
    .replace("you left your knight hanging", "\u4f60\u7684\u9a6c\u5904\u4e8e\u63c2\u5b50\u72b6\u6001")
    .replace("you left your pawn hanging", "\u4f60\u7684\u5175\u5904\u4e8e\u63c2\u5b50\u72b6\u6001")
    .replace("you left a piece hanging", "\u4f60\u6709\u5b50\u529b\u5904\u4e8e\u63c2\u5b50\u72b6\u6001")
    .replace("you gave up control of the center", "\u4f60\u4e22\u6389\u4e86\u4e2d\u5fc3\u63a7\u5236")
    .replace(
      "you spent a tempo on a heavy piece instead of development",
      "\u4f60\u628a\u4e00\u6b65\u7528\u5728\u540e\u8f66\u8fd9\u7c7b\u91cd\u5b50\u4e0a\uff0c\u800c\u4e0d\u662f\u7ee7\u7eed\u51fa\u5b50",
    )
    .replace("your pieces became less active", "\u4f60\u7684\u5b50\u529b\u6d3b\u52a8\u6027\u53d8\u5dee\u4e86")
    .replace("your king is still stuck in the center", "\u4f60\u7684\u738b\u4ecd\u7136\u505c\u5728\u4e2d\u8def")
    .replace("you opened lines toward your king", "\u4f60\u6253\u5f00\u4e86\u901a\u5411\u81ea\u5df1\u738b\u7684\u7ebf\u8def")
    .replace("you allowed a forcing tactical reply", "\u4f60\u5141\u8bb8\u4e86\u5bf9\u624b\u51fa\u73b0\u5f3a\u5236\u6027\u624b\u6bb5")
    .replace("the move gives your opponent an easier position", "\u8fd9\u6b65\u68cb\u8ba9\u5bf9\u624b\u66f4\u5bb9\u6613\u4e0b\u68cb");
}
