// Chat only reads room membership; game state and game messages stay separate.
export class RoomChat {
  constructor(rooms) { this.rooms = rooms; this.rates = new WeakMap(); }
  handle(client, message) {
    const reject = text => client.send({ type: 'chatError', message: text });
    const member = this.rooms.members.get(client.id);
    if (!member) { reject('방에 참가한 뒤 채팅할 수 있습니다.'); return; }
    if (typeof message.text !== 'string') { reject('채팅 내용을 다시 입력하세요.'); return; }
    const text = message.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if (!text || text.length > 500) { reject('메시지는 1~500자로 입력하세요.'); return; }
    const now = Date.now();
    let rate = this.rates.get(client);
    if (!rate || now - rate.start >= 1000) { rate = { start: now, count: 0 }; this.rates.set(client, rate); }
    if (rate.count >= 5) { reject('잠시 후 다시 보내주세요.'); return; }
    rate.count++;
    const event = { type: 'chat', code: member.room.code, seat: member.seat, text };
    for (const player of member.room.players) if (player) player.client.send(event);
  }
}
