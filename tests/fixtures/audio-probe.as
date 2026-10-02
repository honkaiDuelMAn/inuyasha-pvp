// Test-only observation of the real original Flash Sound manager.
var audioProbe = {starts:{},stops:{}};
var audioGame = _level0.pvpgame;
audioProbe.originalStart = audioGame.soundManager.start;
audioProbe.originalStop = audioGame.soundManager.stop;
audioGame.soundManager.start = function(args) {
    audioProbe.starts[args.id] = Number(audioProbe.starts[args.id] || 0)+1;
    audioProbe.originalStart.call(this,args);
};
audioGame.soundManager.stop = function(args) {
    audioProbe.stops[args.id] = Number(audioProbe.stops[args.id] || 0)+1;
    audioProbe.originalStop.call(this,args);
};
audioProbe.inspect = function() {
    var sounds = audioGame.soundManager._sounds;
    return {titlePlaying:sounds.themeSong.isPlaying,titlePosition:sounds.themeSong.obj.position,
            titleStops:Number(this.stops.themeSong || 0),defeatStops:Number(this.stops.youDie || 0),
            battleStarts:Number(this.starts.battle || 0),roundStarts:Number(this.starts.beginRound || 0)};
};
flash.external.ExternalInterface.addCallback("pvpAudioState",audioProbe,audioProbe.inspect);
