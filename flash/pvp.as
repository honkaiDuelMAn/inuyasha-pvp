stop();
var gameRoot = _level0;
var g = gameRoot.pvpgame;
var b = gameRoot.pvpBridge = {seat:0, match:0, round:0, phase:"selecting", timer:0};
var ei = flash.external.ExternalInterface;
b.emit = function(kind, data) { flash.external.ExternalInterface.call("pvpEvent", kind, data); };
b.configure = function(seat) { this.seat = Number(seat); return true; };
b.select = function() {
    if (this.phase != "selecting") { return false; }
    g.movieMediator._pickUserCharacter();
    return true;
};
b.reset = function() {
    clearInterval(this.timer);
    this.phase = "selecting";
    this.round = 0;
    g.viewPickMoves.hidePicker();
    g.viewPickMoves.closeHelp();
    g.viewRound.hide();
    g.viewBattleLoading.hide();
    g.viewMatchResult.hide();
    g.viewVersus.hide();
    g.gameManager._playersMoves = [[],[]];
    g.gameManager._players = [{},{}];
    g.gameManager._roundSummary = {};
    g.gameManager._roundsCount = 0;
    g.movieMediator._players = [{},{}];
    g.movieMediator._pickUserCharacter();
    return true;
};
b.start = function(match, idsText, cardsText, dedicatedText) {
    var ids = idsText.split(",");
    var cards = cardsText == "" ? [] : cardsText.split(",");
    var dedicated = dedicatedText == undefined ? ["",""] : dedicatedText.split(",");
    this.match = Number(match);
    this.round = 1;
    this.phase = "loading";
    // Match the original userDoneWithVersus audio transition.
    g.soundManager.stop({id:"themeSong"});
    g.soundManager.stop({id:"youDie"});
    g.viewPickCharacter.hidePickCharacter();
    g.viewVersus.hide();
    g.viewRound.hide();
    g.viewPickMoves.hidePicker();
    g.Prefs.easyWin = false;
    var players = [];
    for (var i=0; i<2; i++) {
        var bonus = {};
        for (var j=0; j<cards.length; j++) { bonus[cards[j]] = g.movieMediator._allMoves[cards[j]]; }
        if (dedicated[i] != "" && dedicated[i] != undefined) { bonus[dedicated[i]] = g.movieMediator._allMoves[dedicated[i]]; }
        players[i] = g.movieMediator._createPlayer({character:g.movieMediator._characters[ids[i]],type:i,advancedMoves:bonus});
    }
    g.pickMovesManager._humanPlayerIndex = this.seat;
    g.pickMovesManager._computerPlayerIndex = 1-this.seat;
    g.movieMediator._players = players;
    g.battleLoadManager.load({ids:ids});
    g.gameManager.newMatch({players:players});
    this.loadStarted = getTimer();
    clearInterval(this.timer);
    this.timer = setInterval(this, "pollLoaded", 100);
    return true;
};
b.pollLoaded = function() {
    if (g.battleLoadManager.getPercentLoaded() == 100) {
        clearInterval(this.timer);
        this.emit("loaded", {match:this.match});
    } else if (getTimer()-this.loadStarted > 45000) {
        clearInterval(this.timer);
        this.emit("fault", {message:"캐릭터 리소스를 불러오지 못했습니다."});
    }
};
b.next = function(match, round) {
    if (Number(match) != this.match || !(this.phase == "loading" || this.phase == "waiting")) { return false; }
    this.round = Number(round);
    this.phase = "picking";
    g.gameManager._roundsCount = this.round;
    g.gameManager.pvpOriginalRequest.call(g.gameManager);
    return true;
};
b.play = function(match, round, hand0Text, hand1Text) {
    if (Number(match) != this.match || Number(round) != this.round || this.phase != "submitted") { return false; }
    var hands = [hand0Text.split(","),hand1Text.split(",")];
    var moves = [[],[]];
    for (var i=0; i<2; i++) {
        for (var j=0; j<3; j++) { moves[i][j] = g.gameManager._players[i].moves[hands[i][j]]; }
        g.gameManager._players[i].roundMoves = moves[i];
    }
    this.phase = "playing";
    g.viewPickMoves.hidePicker();
    g.gameManager.newMoves({moves:moves});
    return true;
};
b.retry = function(match, round) {
    if (Number(match) != this.match || Number(round) != this.round || this.phase != "submitted") { return false; }
    this.phase = "picking";
    g.gameManager.pvpOriginalRequest.call(g.gameManager);
    return true;
};
g.movieMediator.userPickedCharacter = function(args) {
    if (b.phase != "selecting") { return; }
    g.viewPickCharacter.hidePickCharacter();
    b.emit("character", {character:args.character.id});
};
g.pickMovesManager.donePickingMoves = function(args) {
    if (b.phase != "picking") { return; }
    var ids = [];
    for (var i=0; i<3; i++) { if (args.moves[i].id == undefined) { return; } ids[i] = args.moves[i].id; }
    b.phase = "submitted";
    g.viewPickMoves.hidePicker();
    b.emit("moves", {match:b.match,round:b.round,moves:ids});
};
g.gameManager.pvpOriginalRequest = g.gameManager._requestMoves;
g.gameManager._requestMoves = function() {
    if (b.phase == "loading") { return; }
    b.phase = "waiting";
    g.viewRound.hide();
    b.emit("finished", {match:b.match,round:b.round});
};
g.gameManager.pvpOriginalBegin = g.gameManager._beginRound;
g.gameManager._beginRound = function(args) {
    this.pvpOriginalBegin.call(this,args);
    var summary = this._roundSummary;
    var state = [];
    for (var i=0; i<2; i++) { var p = this._players[i]; state[i] = {life:p.life,energy:p.energy,loc:[p.loc[0],p.loc[1]]}; }
    var winner = summary.matchResult == "win" ? Number(summary.winner) : null;
    b.emit("resolved", {match:b.match,round:b.round,players:state,result:summary.matchResult,winner:winner});
};
g.gameManager._matchDone = function(args) {
    this.em.broadcast({event:"matchDone",args:{matchResult:args.matchResult}});
};
g.movieMediator.matchDone = function(args) {
    b.phase = "result";
    b.emit("finished", {match:b.match,round:b.round});
};
g.movieMediator.userDoneWithMatchResult = function() { b.emit("rematch",{}); };
// Add one native card clip for five common cards plus a character card.
// Keep the original five-card layout whenever at most five cards are present.
var picker = g.viewPickMoves;
var row = picker._moveSelectorClips[2];
var origins = [];
for (var slotIndex=0; slotIndex<5; slotIndex++) {
    origins[slotIndex] = {x:row[slotIndex]._x,y:row[slotIndex]._y,xscale:row[slotIndex]._xscale,yscale:row[slotIndex]._yscale};
}
row[4].duplicateMovieClip("card_25_pvp_mc",12000);
row[5] = picker._display_mc.card_25_pvp_mc;
// Keep the additional card in the card layer, below native dialog overlays.
row[5].swapDepths(row[4].getDepth()+1);
picker._registerInputReceptor({obj:row[5]});
picker.pvpOrigins = origins;
picker.pvpOriginalShowMoves = picker._showMoves;
picker._showMoves = function() {
    var count = 0;
    for (var id in this._playerMoves) { if (this._playerMoves[id].advanced) { count++; } }
    var clips = this._moveSelectorClips[2];
    var saved = this.pvpOrigins;
    var step = (saved[4].x-saved[0].x)/4;
    var ratio = count > 5 ? 5/6 : 1;
    for (var i=0; i<6; i++) {
        var origin = i < 5 ? saved[i] : saved[4];
        clips[i]._visible = i < count;
        clips[i]._x = count > 5 ? saved[0].x+i*step*ratio : origin.x;
        clips[i]._y = origin.y;
        clips[i]._xscale = origin.xscale*ratio;
        clips[i]._yscale = origin.yscale*ratio;
    }
    this.pvpOriginalShowMoves.call(this);
};
ei.addCallback("pvpConfigure",b,b.configure);
ei.addCallback("pvpSelect",b,b.select);
ei.addCallback("pvpStart",b,b.start);
ei.addCallback("pvpPlay",b,b.play);
ei.addCallback("pvpNext",b,b.next);
ei.addCallback("pvpReset",b,b.reset);
ei.addCallback("pvpRetry",b,b.retry);
b.emit("ready",{});
