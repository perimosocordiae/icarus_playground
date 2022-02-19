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

// TODO: poll every 100ms for job output/completion

function run() {
  var code = editor.getValue();
  output.innerHTML = '';
  document.querySelector('button').disabled = true;
  fetch('/run', { method: 'POST', body: code })
    .then((response) => {
      if (!response.ok) throw Error(response.statusText);
      return response.json();
    })
    .then((data) => {
      document.querySelector('button').disabled = false;
      const output = document.getElementById('output');
      output.style.backgroundColor = (data.return_code != 0) ? 'lightpink' : 'antiquewhite';
      output.innerText = data.stdout;
      if (data.stderr.length > 0) {
        var err = document.createElement('div');
        err.classList.add('stderr');
        err.innerHTML = decode_ansi_colors(data.stderr);
        output.appendChild(err);
      }
    }).catch((err) => {
      document.querySelector('button').disabled = false;
      console.log(err);
    });
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