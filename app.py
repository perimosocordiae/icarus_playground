#!/usr/bin/env python3
import flask
import os
import pathlib
import random
import shutil
import subprocess
import tempfile
from argparse import ArgumentParser
from typing import Tuple

app = flask.Flask(__name__)


@app.route('/')
@app.route('/<example>.ic')
def index(example=None):
    examples = {p.name: p for p in app.icarus_repo.glob('examples/*.ic')}
    if example:
        example = f'{example}.ic'
    else:
        example = random.choice(list(examples.keys()))
    code = examples[example].open().read()
    return flask.render_template('index.html', demo_code=code,
                                 example=example, examples=examples)


@app.route('/run', methods=['POST'])
def run():
    code = flask.request.data.decode('utf-8')
    return_code, stdout, stderr = run_icarus_code(code)
    return flask.jsonify({
        'return_code': return_code,
        'stdout': stdout,
        'stderr': stderr,
    })


def run_icarus_code(code: str) -> Tuple[int, str, str]:
    app.logger.info('User code:\n%s', code)
    with tempfile.NamedTemporaryFile(mode='w+t', suffix='.ic') as f:
        f.write(code)
        f.flush()
        command = [str(app.binary_path), '--module_paths',
                   str(app.icarus_repo / 'stdlib'), str(f.name)]
        app.logger.info('Command: %s', ' '.join(command))
        proc = subprocess.run(command,
                              stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE)
    return (proc.returncode,
            proc.stdout.decode('utf-8'),
            proc.stderr.decode('utf-8'))


def parse_flags():
    ap = ArgumentParser()
    ap.add_argument('--port', type=int, default=8787)
    ap.add_argument('--icarus-repo', default=os.path.expanduser(
        '~/Documents/Icarus'), help='Path to Icarus git repo')
    return ap.parse_args()


def main():
    flags = parse_flags()
    app.icarus_repo = pathlib.Path(flags.icarus_repo)
    if not app.icarus_repo.exists():
        raise ValueError('Icarus git repo not found')
    binary_path = app.icarus_repo / 'bazel-bin/compiler/interpret'
    if not binary_path.exists():
        raise NotImplementedError('TODO: run bazel build')
    with tempfile.NamedTemporaryFile(mode='x') as f:
        f.close()
        shutil.copyfile(binary_path, f.name)
        app.binary_path = pathlib.Path(f.name)
        app.binary_path.chmod(0o755)
        app.run(host='0.0.0.0', port=flags.port, debug=True)


if __name__ == '__main__':
    main()
