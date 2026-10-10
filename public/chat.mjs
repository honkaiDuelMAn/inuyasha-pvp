export function createRoomChat({ send }) {
  const input = document.getElementById('chatInput');
  const button = document.getElementById('chatSend');
  const messages = document.getElementById('chatMessages');
  const empty = document.getElementById('chatEmpty');
  const status = document.getElementById('chatStatus');
  let roomCode = null, mySeat = null, composing = false;
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (composing || event.isComposing || event.keyCode === 229)) event.preventDefault();
  });
  input.form.addEventListener('submit', event => {
    event.preventDefault();
    if (!roomCode || composing) return;
    const text = input.value.trim();
    if (!text) return;
    send({ type: 'chat', text });
    input.value = '';
    input.focus({ preventScroll: true });
  });
  return {
    setRoom(code, seat) {
      const changed = code !== roomCode || seat !== mySeat;
      if (changed) {
        messages.replaceChildren(); empty.hidden = false; input.value = ''; composing = false;
        status.textContent = code ? '같은 방의 1P · 2P와 대화하세요.' : '방에 참가하면 채팅할 수 있습니다.';
      }
      roomCode = code; mySeat = seat;
      input.disabled = !code; button.disabled = !code;
    },
    receive(event) {
      if (event.type === 'chatError') { status.textContent = event.message; return; }
      if (event.code !== roomCode || ![0, 1].includes(event.seat) || typeof event.text !== 'string') return;
      const follow = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 36 || event.seat === mySeat;
      const item = document.createElement('div'); item.className = 'chat-message';
      if (event.seat === mySeat) item.classList.add('chat-message-mine');
      const sender = document.createElement('span'); sender.className = 'chat-sender';
      sender.textContent = `${event.seat + 1}P${event.seat === mySeat ? ' · 나' : ''}`;
      const text = document.createElement('p'); text.className = 'chat-text'; text.textContent = event.text;
      item.append(sender, text); messages.append(item); empty.hidden = true;
      while (messages.children.length > 200) messages.firstElementChild.remove();
      if (follow) messages.scrollTop = messages.scrollHeight;
      status.textContent = '같은 방의 1P · 2P와 대화하세요.';
    }
  };
}
