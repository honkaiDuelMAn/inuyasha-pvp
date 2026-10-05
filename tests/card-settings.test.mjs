import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomService, drawBonus, validateMoves} from '../server/rooms.mjs';

const common = ['doubleLeft','doubleRight','heal','kikyosRevenge','perfectGuard'];
const client = id => ({id,events:[],send(event){this.events.push(structuredClone(event));}});
const last = (c,type) => c.events.filter(e=>e.type===type).at(-1);
function room(settings={}) {
  const service=new RoomService({randomInt:()=>0}),host=client('h'),guest=client('g');
  service.handle(host,{type:'create',bonusCount:0,...settings});
  assert.ok(last(host,'joined'),last(host,'error')?.message);
  service.handle(guest,{type:'join',code:last(host,'joined').code});
  return {service,host,guest};
}
function start(ctx,characters=['i','s']) {
  for(const [i,c] of [ctx.host,ctx.guest].entries()) {
    ctx.service.handle(c,{type:'character',character:characters[i]});
    ctx.service.handle(c,{type:'ready'});
  }
  const event=last(ctx.host,'start');assert.ok(event,last(ctx.host,'error')?.message);
  return event;
}
function load(ctx,event) {for(const c of [ctx.host,ctx.guest])ctx.service.handle(c,{type:'loaded',match:event.match});}

test('five common cards give both seats all five kinds without a summon in the shared pool',()=>{
  for(const characters of [['i','i'],['i','s'],['sa','ko']]) {
    const ctx=room({bonusCount:5}),event=start(ctx,characters);
    assert.deepEqual([...event.bonusCards].sort(),common);
    assert.deepEqual(event,last(ctx.guest,'start'));
    assert.deepEqual(event.dedicatedCards,[[],[]]);
  }
});
test('same-character common draws never randomly award a character summon',()=>{
  const actual=drawBonus(['s','s'],5,max=>max-1);
  assert.deepEqual([...actual].sort(),common);
});
test('banning heal and Kikyo lowers an existing five-card setting to three and excludes both',()=>{
  const ctx=room({bonusCount:5});
  ctx.service.handle(ctx.host,{type:'configure',bannedCards:['heal','kikyosRevenge']});
  const view=last(ctx.host,'room');
  assert.equal(view.bonusCount,3);assert.equal(view.maxBonusCount,3);
  assert.deepEqual(view,last(ctx.guest,'room'));
  assert.deepEqual([...start(ctx).bonusCards].sort(),['doubleLeft','doubleRight','perfectGuard']);
});
test('unbanning restores the maximum but keeps the chosen count until the host changes it',()=>{
  const ctx=room({bonusCount:5,bannedCards:['heal','kikyosRevenge']});
  assert.equal(last(ctx.host,'room').bonusCount,3);
  ctx.service.handle(ctx.host,{type:'configure',bannedCards:[]});
  assert.equal(last(ctx.host,'room').maxBonusCount,5);assert.equal(last(ctx.host,'room').bonusCount,3);
  ctx.service.handle(ctx.host,{type:'configure',bonusCount:5});
  assert.equal(start(ctx).bonusCards.length,5);
});
test('banning all five cards draws no randomness even with dedicated cards enabled',()=>{
  const ctx=room({bonusCount:5,bannedCards:common,dedicatedEnabled:true});
  ctx.service.randomInt=()=>{throw Error('No random draw permitted');};
  const event=start(ctx,['sa','s']);
  assert.deepEqual(event.bonusCards,[]);
  assert.deepEqual(event.dedicatedCards,[['summonKirara'],['summonJaken']]);
  assert.equal(last(ctx.host,'room').maxBonusCount,0);
});
test('dedicated ON gives every character its own original summon with zero common cards',()=>{
  const expected={i:'summonShippo',ke:'summonShippo',m:'summonShippo',ka:'summonDemons',n:'summonDemons',s:'summonJaken',sa:'summonKirara',ko:'summonWolves'};
  for(const [character,card] of Object.entries(expected)) {
    const ctx=room({dedicatedEnabled:true});
    ctx.service.randomInt=()=>{throw Error('Dedicated cards are not randomized');};
    const event=start(ctx,[character,'s']);
    assert.deepEqual(event.bonusCards,[]);assert.deepEqual(event.dedicatedCards[0],[card]);
    assert.deepEqual(event.dedicatedCards[1],['summonJaken']);
  }
});
test('a seat can use its own dedicated card, while another character summon is rejected',()=>{
  const ctx=room({dedicatedEnabled:true}),event=start(ctx,['i','s']);load(ctx,event);
  ctx.service.handle(ctx.host,{type:'moves',match:event.match,round:1,moves:['summonJaken','guard','energyUp']});
  assert.equal(last(ctx.host,'error').retryMoves,true);
  ctx.service.handle(ctx.host,{type:'moves',match:event.match,round:1,moves:['summonShippo','guard','energyUp']});
  assert.equal(last(ctx.host,'room').submitted[0],true);
  ctx.service.handle(ctx.guest,{type:'moves',match:event.match,round:1,moves:['summonJaken','guard','energyUp']});
  assert.deepEqual(last(ctx.host,'play').moves,[['summonShippo','guard','energyUp'],['summonJaken','guard','energyUp']]);
});
test('dedicated OFF does not allow a summon even when all common cards are available',()=>{
  const ctx=room({bonusCount:5}),event=start(ctx);load(ctx,event);
  ctx.service.handle(ctx.host,{type:'moves',match:event.match,round:1,moves:['summonShippo','guard','energyUp']});
  assert.equal(last(ctx.host,'error').retryMoves,true);assert.equal(last(ctx.host,'room').submitted[0],false);
});
test('guest and active-match settings cannot change bans or dedicated cards',()=>{
  const ctx=room({bonusCount:2});
  ctx.service.handle(ctx.guest,{type:'configure',bannedCards:['heal'],dedicatedEnabled:true});
  assert.ok(last(ctx.guest,'error'));assert.deepEqual(last(ctx.host,'room').bannedCards,[]);
  assert.equal(last(ctx.host,'room').dedicatedEnabled,false);
  start(ctx);
  ctx.service.handle(ctx.host,{type:'configure',bannedCards:['heal'],dedicatedEnabled:true});
  assert.ok(last(ctx.host,'error'));assert.equal(last(ctx.host,'room').dedicatedEnabled,false);
});
test('invalid configuration is rejected atomically and does not cancel valid readiness',()=>{
  const ctx=room({bonusCount:2});
  ctx.service.handle(ctx.host,{type:'character',character:'i'});ctx.service.handle(ctx.host,{type:'ready'});
  const before=last(ctx.host,'room');
  for(const settings of [{bannedCards:['summonShippo']},{bannedCards:['heal','heal']},{bannedCards:'heal'},{dedicatedEnabled:'true'},{bonusCount:6},{bonusCount:-1},{bonusCount:null}]) {
    ctx.service.handle(ctx.host,{type:'configure',...settings});
    assert.ok(last(ctx.host,'error'));assert.deepEqual(last(ctx.host,'room'),before);
  }
});
test('card settings persist through a completed match and dedicated cards follow newly chosen characters',()=>{
  const ctx=room({bonusCount:5,bannedCards:['heal'],dedicatedEnabled:true}),event=start(ctx);load(ctx,event);
  for(const c of [ctx.host,ctx.guest])ctx.service.handle(c,{type:'moves',match:event.match,round:1,moves:['guard','moveRight','energyUp']});
  for(const c of [ctx.host,ctx.guest])ctx.service.handle(c,{type:'resolved',match:event.match,round:1,players:[{life:100,energy:100,loc:[1,1]},{life:0,energy:100,loc:[1,2]}],result:'win',winner:0});
  for(const c of [ctx.host,ctx.guest])ctx.service.handle(c,{type:'finished',match:event.match,round:1});
  for(const c of [ctx.host,ctx.guest])ctx.service.handle(c,{type:'rematch'});
  const view=last(ctx.host,'room');assert.equal(view.bonusCount,4);assert.equal(view.dedicatedEnabled,true);assert.deepEqual(view.bannedCards,['heal']);
  assert.deepEqual(start(ctx,['sa','ko']).dedicatedCards,[['summonKirara'],['summonWolves']]);
});
test('Secret Sword can be selected with exactly fifteen EN and is rejected with fourteen',()=>{
  const hand=['secretSword','guard','moveRight'];
  assert.equal(validateMoves(hand,hand,15),true);assert.equal(validateMoves(hand,hand,14),false);
});
