const statusEl = document.getElementById('status');
const voteRecorded = document.getElementById('voteRecorded');

const slots = {
  A: {
    image: document.getElementById('imageA'),
    name: document.getElementById('nameA'),
    type: document.getElementById('typeA'),
    count: document.getElementById('countA'),
    button: document.querySelector('[data-choice="A"]'),
    imageButton: document.getElementById('voteA'),
  },
  B: {
    image: document.getElementById('imageB'),
    name: document.getElementById('nameB'),
    type: document.getElementById('typeB'),
    count: document.getElementById('countB'),
    button: document.querySelector('[data-choice="B"]'),
    imageButton: document.getElementById('voteB'),
  },
};

let currentPair = null;
let isVoting = false;

function setStatus(message) {
  statusEl.textContent = message;
}

function setButtonsDisabled(disabled) {
  Object.values(slots).forEach((slot) => {
    slot.button.disabled = disabled;
    slot.imageButton.disabled = disabled;
  });
}

function hideCounts() {
  Object.values(slots).forEach((slot) => {
    slot.count.hidden = true;
  });
}

function showCounts(counts) {
  if (!currentPair) return;
  Object.entries(slots).forEach(([key, slot]) => {
    const card = currentPair[key];
    const stats = counts?.[card.id];
    if (stats) {
      slot.count.textContent = `${stats.votes} votes · ${stats.views} views`;
      slot.count.hidden = false;
    }
  });
}

async function loadPair() {
  setStatus('Loading lands…');
  hideCounts();
  setButtonsDisabled(true);
  try {
    const response = await fetch('/api/pair');
    if (!response.ok) {
      throw new Error('Failed to load');
    }
    const data = await response.json();
    const [cardA, cardB] = data.cards;
    currentPair = { A: cardA, B: cardB };

    slots.A.image.src = cardA.image_url;
    slots.A.image.alt = `${cardA.name} art`;
    slots.A.name.textContent = cardA.name;
    slots.A.type.textContent = cardA.type_line;

    slots.B.image.src = cardB.image_url;
    slots.B.image.alt = `${cardB.name} art`;
    slots.B.name.textContent = cardB.name;
    slots.B.type.textContent = cardB.type_line;

    setStatus('Vote now.');
  } catch (error) {
    console.error(error);
    setStatus('Unable to load lands. Please refresh.');
  } finally {
    setButtonsDisabled(false);
  }
}

async function sendVote(choice) {
  if (!currentPair || isVoting) return;
  isVoting = true;
  setButtonsDisabled(true);
  setStatus(`Vote ${choice} recorded…`);

  const selected = currentPair[choice];
  const other = currentPair[choice === 'A' ? 'B' : 'A'];

  try {
    const response = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedId: selected.id, otherId: other.id }),
    });
    if (!response.ok) {
      throw new Error('Vote failed');
    }
    const data = await response.json();
    showCounts(data.counts);
    voteRecorded.hidden = false;
    setStatus('Vote recorded!');
    await new Promise((resolve) => setTimeout(resolve, 1200));
    voteRecorded.hidden = true;
    await loadPair();
  } catch (error) {
    console.error(error);
    setStatus('Vote failed. Try again.');
  } finally {
    isVoting = false;
    setButtonsDisabled(false);
  }
}

Object.values(slots).forEach((slot, index) => {
  const choice = index === 0 ? 'A' : 'B';
  slot.button.addEventListener('click', () => sendVote(choice));
  slot.imageButton.addEventListener('click', () => sendVote(choice));
});

document.addEventListener('keydown', (event) => {
  if (event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) {
    return;
  }
  if (event.key.toLowerCase() === 'a') {
    sendVote('A');
  }
  if (event.key.toLowerCase() === 'b') {
    sendVote('B');
  }
});

loadPair();
