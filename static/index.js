var editor = ace.edit("editor");
editor.setTheme("ace/theme/monokai");
editor.setOptions({
  fontSize: "13pt",
  showGutter: window.innerWidth > 800,
});
editor.commands.addCommand({
  name: 'run',
  bindKey: { win: 'Ctrl-Enter', mac: 'Cmd-Enter' },
  exec: run,
});
editor.commands.addCommand({
  name: 'save',
  bindKey: { win: 'Ctrl-s', mac: 'Cmd-s' },
  exec: (editor) => {
    var a = document.createElement('a');
    var file = new Blob([editor.getValue()], { type: 'text/plain' });
    a.href = URL.createObjectURL(file);
    a.download = 'playground.ic';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); }, 0);
  },
});

var currentInterval = null;
const POLL_INTERVAL_MS = 250;

function run() {
  var code = editor.getValue();
  document.getElementById('output').innerHTML = '';
  document.querySelector('button').disabled = true;
  fetch('/run', { method: 'POST', body: code })
    .then(maybeJson)
    .then((data) => {
      currentInterval = setTimeout(poll, POLL_INTERVAL_MS, data.pid);
    }).catch(handleError);
}

function poll(pid) {
  fetch(`/poll/${pid}`)
    .then(maybeJson)
    .then((data) => {
      const output = document.getElementById('output');
      const done = data.status != 'running';
      if (data.status == 'error') {
        output.style.backgroundColor = 'lightpink';
        var err = document.createElement('div');
        err.classList.add('stderr');
        err.innerHTML = decode_ansi_colors(data.message);
        output.appendChild(err);
      } else {
        output.style.backgroundColor = 'antiquewhite';
        output.innerText = output.innerText + data.output;
      }
      if (done) {
        document.querySelector('button').disabled = false;
        currentInterval = null;
      } else {
        currentInterval = setTimeout(poll, POLL_INTERVAL_MS, pid);
      }
    }).catch(handleError);
}

function maybeJson(response) {
  if (!response.ok) throw Error(response.statusText);
  return response.json();
}

function handleError(err) {
  document.querySelector('button').disabled = false;
  console.log(err);
  const output = document.getElementById('output');
  output.style.backgroundColor = 'lightpink';
  output.innerText = err.message;
}

// See https://en.wikipedia.org/wiki/ANSI_escape_code#Colors
function decode_ansi_colors(str) {
  return str.replace(/\x1B\[31;1m/g, '<span class="bold red">')
    .replace(/\x1B\[97;1m/g, '<span class="bold">')
    .replace(/\x1B\[0;1;31m/g, '</span><span class="bold red">')
    .replace(/\x1B\[0;1;34m/g, '</span><span class="bold blue">')
    .replace(/\x1B\[0;1;37m/g, '</span><span class="bold">')
    .replace(/\x1B\[0m/g, '</span>');
};

function chooseExample(sel) {
  window.location.replace('/' + sel.value);
}