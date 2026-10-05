var probe = {};
probe.inspect = function() {
    var game = _level0.pvpgame;
    var view = game.viewPickMoves;
    var slots = [];
    for (var i=0; i<view._moveSelectorClips[2].length; i++) {
        var clip = view._moveSelectorClips[2][i];
        var bounds = clip.getBounds(_level0);
        slots.push({id:clip.moveId,visible:clip._visible,press:clip.onPress != undefined,depth:clip.getDepth(),x:(bounds.xMin+bounds.xMax)/2,y:(bounds.yMin+bounds.yMax)/2,width:bounds.xMax-bounds.xMin});
    }
    var regular = [];
    for (var rowIndex=0; rowIndex<2; rowIndex++) {
        for (var column=0; column<5; column++) {
            var card = view._moveSelectorClips[rowIndex][column];
            var rect = card.getBounds(_level0);
            regular.push({id:card.moveId,x:(rect.xMin+rect.xMax)/2,y:(rect.yMin+rect.yMax)/2});
        }
    }
    var players = [];
    for (var j=0; j<2; j++) {
        var moves = [];
        for (var id in game.gameManager._players[j].moves) {
            var move = game.gameManager._players[j].moves[id];
            moves.push({id:id,advanced:move.advanced,energy:move.userImpact.energyDiff,damage:move.enemyImpact.lifeDiff});
        }
        players.push({character:game.gameManager._players[j].characterId,moves:moves});
    }
    var children = [];
    for (var name in view._display_mc) {
        var child = view._display_mc[name];
        if (typeof(child) == "movieclip") { children.push({name:name,depth:child.getDepth()}); }
    }
    return {players:players,slots:slots,regularSlots:regular,displayChildren:children,helpDepth:view._display_mc.help_mc.getDepth()};
};
flash.external.ExternalInterface.addCallback("pvpTestState",probe,probe.inspect);
