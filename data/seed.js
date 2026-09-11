/* 單字資料 —— 使用者現在自己在 App 裡加字，這裡只放一次性整理指令。
   之後要幫他加字時，把字放進 SEED_WORDS 並把 SEED_VERSION +1。 */
window.SEED_VERSION = 3;

/* 2026-09-11 使用者要求：刪掉我準備的 127 個雅思單字（8 個牌組），
   只留他自己建的「自己背」和「Sep 11」，並把「自己背」改名「Sep 10」。
   v 對到 SEED_VERSION，每台裝置只會執行一次；刪掉的東西留墓碑，同步不會復活。 */
window.SEED_MIGRATE = {
  v: 3,
  dropDecks: ["core", "edu", "env", "tech", "health", "society", "work", "chart"],
  renameDecks: {"自己背": "Sep 10"},
  resetCurDeck: true
};

window.SEED_WORDS = [];
