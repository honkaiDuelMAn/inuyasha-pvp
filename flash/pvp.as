if (_root.pvp == "true") {
    _root.pvpBridge = {};
    var ei = flash.external.ExternalInterface;
    _root.pvpBridge.ping = function() { return "original-engine-pvp"; };
    ei.addCallback("pvpPing", _root.pvpBridge, _root.pvpBridge.ping);
    ei.call("pvpEvent", "ready", "");
}
