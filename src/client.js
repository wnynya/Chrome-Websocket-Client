const themes = ['Auto', 'Light', 'Dark'];
let currentTheme = 'Auto';

const template = document.querySelector('#client-template').innerHTML;
const input_name = document.querySelector('#client-name');

function randomString(length, pool = '0123456789abcdefghijklmnopqrstuvwxyz') {
  if (typeof pool == 'string') {
    if (pool == 'hex') {
      pool = '0123456789abcdef'.split('');
    } else if (pool == 'num' || pool == 'number') {
      pool = '0123456789'.split('');
    } else {
      pool = pool.split('');
    }
  } else if (!(pool instanceof Array)) {
    throw new Error('pool must instanceof Array or typeof string');
  }
  let string = '';
  for (let i = 0; i < length; i++) {
    string += pool[Math.floor(Math.random() * pool.length)];
  }
  return string;
}

const Storage = {
  save: async () => {
    let storage = {
      theme: currentTheme,
      clients: [],
      current: Client.selected ? Client.selected.uid : null,
    };
    for (const button of document.querySelectorAll(
      '#sessions-list > .button'
    )) {
      const uid = button.getAttribute('client');
      storage.clients.push(uid);
    }
    await chrome.storage.sync.set({ data: storage });
  },
  load: async () => {
    const storage = await chrome.storage.sync.get(['data']);
    const data = storage.data;
    if (data?.theme) {
      currentTheme = data.theme;
      updateTheme();
    } else {
      updateTheme();
    }
    if (data?.clients) {
      for (const uid of data.clients) {
        await Client.create(uid, false);
      }
      if (data.clients.length == 0) {
        await Client.create();
      }
    } else {
      await Client.create();
    }
    if (data?.current) {
      Client.map[data.current].show();
    }
  },
};

class Client {
  static map = {};
  static list = [];
  static selected = null;

  constructor(uid = randomString(42), element) {
    this.uid = uid;
    this.name = 'A New Client';
    this.socket = null;

    this.element = {};
    this.element.root = element;
    this.element.root.innerHTML = template;
    this.element.input_url = this.element.root.querySelector('.input-url');
    this.element.button_url = this.element.root.querySelector('.button-url');
    this.element.button_send = this.element.root.querySelector('.button-send');
    this.element.textarea_send =
      this.element.root.querySelector('.textarea-send');
    this.element.button_logs_send =
      this.element.root.querySelector('.button-logs-clear');
    this.element.logs_display =
      this.element.root.querySelector('.logs-display');

    this.addEventListener();
  }

  async save() {
    const storage = {};
    storage[`client-${this.uid}`] = {
      name: this.name,
      host: this.element.input_url.value,
      send: this.element.textarea_send.value,
      logs: this.element.logs_display.innerHTML,
    };
    await chrome.storage.sync.set(storage);
    await Storage.save();
  }

  async load() {
    const storage = await chrome.storage.sync.get([`client-${this.uid}`]);
    const data = storage[`client-${this.uid}`];
    if (data?.name) {
      this.name = data.name;
      this.element.input_url.value = data.host;
      this.element.textarea_send.value = data.send;
      this.element.logs_display.innerHTML = data.logs;
      document.querySelector(
        `#sessions-list [client="${this.uid}"] > label`
      ).innerText = data.name;
    }
  }

  async remove() {
    await chrome.storage.local.remove([`client-${this.uid}`]);
  }

  addEventListener() {
    this.element.button_url.addEventListener('click', () => {
      const host = this.element.input_url.value;
      if (this.socket != null) {
        if (this.socket.readyState == 3) {
          this.open(host);
        } else {
          this.close();
        }
      } else {
        this.open(host);
      }
    });

    this.element.button_send.addEventListener('click', () => {
      const data = this.element.textarea_send.value;
      this.send(data);
    });

    this.element.button_logs_send.addEventListener('click', () => {
      this.element.logs_display.innerHTML = '';
      this.save();
    });

    this.element.input_url.addEventListener('change', (event) => {
      this.save();
    });

    this.element.textarea_send.addEventListener('change', (event) => {
      this.save();
    });
  }

  open(url) {
    this.status('connecting');
    this.element.button_url.innerText = 'Close';

    this.socket = new WebSocket(url);

    this.socket.addEventListener('open', (event) => {
      this.status('opened');
      this.log('CONNECTION OPENED', 'opened');
    });

    this.socket.addEventListener('message', (event) => {
      const data = event.data;
      this.log('HOST => ' + data, 'host');
    });

    this.socket.addEventListener('close', (event) => {
      this.status('closed');
      this.element.button_url.innerText = 'Open';
      this.log('CONNECTION CLOSED', 'closed');
    });

    this.socket.addEventListener('error', (event) => {
      this.log('[ERROR]', 'error');
      console.warn(event);
    });
  }

  send(data) {
    if (this.socket && this.socket.readyState == 1) {
      this.socket.send(data);
      this.log('YOU => ' + data, 'you');
    }
  }

  close() {
    if (this.socket != null) {
      this.socket.close();
    }
  }

  show(save = true) {
    for (const client of Client.list) {
      client.hide();
    }
    this.element.root.setAttribute('show', 'true');
    document
      .querySelector(`#sessions-list [client="${this.uid}"]`)
      .setAttribute('show', 'true');
    input_name.value = this.name;
    Client.selected = this;
    save ? this.save() : null;
  }

  hide() {
    this.element.root.setAttribute('show', 'false');
    document
      .querySelector(`#sessions-list [client="${this.uid}"]`)
      .setAttribute('show', 'false');
  }

  pop() {
    this.close();
    this.element.root.parentElement.removeChild(this.element.root);
    const button = document.querySelector(
      `#sessions-list [client="${this.uid}"]`
    );
    button.parentElement.removeChild(button);
    this.remove();
    delete Client.map[this.uid];
    Client.list.splice(Client.list.indexOf(this), 1);
    if (Client.selected == this) {
      Client.selected = null;
      const cl = Client.list;
      if (cl.length > 0) {
        cl[0].show();
      }
    }
    Storage.save();
  }

  status(status) {
    try {
      const ste = this.element.root.querySelector('.status');
      ste.innerText = status.toUpperCase();
      ste.setAttribute('status', status);
      document
        .querySelector(`#sessions-list [client="${this.uid}"] .status`)
        .setAttribute('status', status);
    } catch (e) {}
  }

  log(data, type) {
    const logs = this.element.logs_display;

    const timestamp = document.createElement('span');
    timestamp.setAttribute('message-type', 'timestamp');
    timestamp.innerHTML = `[${new Date().toTimeString().substring(0, 8)}] `;
    logs.appendChild(timestamp);

    const message = document.createElement('span');
    message.setAttribute('message-type', type);
    message.innerHTML = data;
    logs.appendChild(message);

    logs.appendChild(document.createElement('br'));

    this.save();
  }

  static async create(uid, save = true) {
    const element = document.createElement('div');
    element.classList.add('client');
    const client = new Client(uid, element);
    Client.map[client.uid] = client;
    Client.list.push(client);
    document.querySelector('#client-wrapper').appendChild(element);

    const button = document.createElement('div');
    button.setAttribute('client', client.uid);
    button.classList.add('button');
    button.innerHTML = `
      <div class="status" status="closed"></div>
      <label>${client.name}</label>
      <div class="close">&times;</div>
    `;
    button.addEventListener('click', (event) => {
      let target = event.target;
      while (!target.classList.contains('button')) {
        if (target.classList.contains('close')) {
          return;
        }
        target = target.parentElement;
      }
      const uid = target.getAttribute('client');
      Client.map[uid].show();
    });
    button.querySelector('.close').addEventListener('click', (event) => {
      let target = event.target;
      while (!target.classList.contains('button')) {
        target = target.parentElement;
      }
      const uid = target.getAttribute('client');
      Client.map[uid].pop();
    });
    document.querySelector('#sessions-list').appendChild(button);

    await client.load();

    client.show(false);

    save ? Storage.save() : null;

    return client;
  }
}

function updateTheme() {
  document.querySelector('#button-change-theme').innerHTML =
    'Theme: ' + currentTheme;
  switch (currentTheme) {
    case 'Auto': {
      document.body.setAttribute(
        'theme',
        window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
      );
      break;
    }
    case 'Light': {
      document.body.setAttribute('theme', 'light');
      break;
    }
    case 'Dark': {
      document.body.setAttribute('theme', 'dark');
      break;
    }
  }
}

async function init() {
  await Storage.load();

  document.querySelector('#button-new-client').addEventListener('click', () => {
    Client.create();
  });

  input_name.addEventListener('change', (event) => {
    if (Client.selected) {
      Client.selected.name = input_name.value;
      document.querySelector(
        `#sessions-list [client="${Client.selected.uid}"] > label`
      ).innerText = Client.selected.name;
      Client.selected.save();
    }
  });

  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', (event) => {
      updateTheme();
      Storage.save();
    });

  document
    .querySelector('#button-change-theme')
    .addEventListener('click', () => {
      let index = themes.indexOf(currentTheme);
      index++;
      if (index >= themes.length) {
        index = 0;
      }
      currentTheme = themes[index];
      document.body.setAttribute('prefer', currentTheme);
      updateTheme();
      Storage.save();
    });

  updateTheme();
}

init();
