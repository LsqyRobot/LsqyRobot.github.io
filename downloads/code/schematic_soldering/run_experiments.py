#!/usr/bin/env python3
"""Run real ngspice decks and compare numerical output with circuit equations.

Standard library only. Run in the accompanying Docker image, or locally if
Python 3 and ngspice are already installed. All outputs go to a new directory.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
from html import escape


def data(path):
    rows = []
    for line in path.read_text().splitlines():
        try:
            rows.append([float(v) for v in line.split()])
        except ValueError:
            continue
    if not rows:
        raise RuntimeError('No numeric simulation output: ' + str(path))
    return rows


def simulate(path, out):
    out.mkdir(parents=True, exist_ok=False)
    local = out / path.name
    shutil.copy2(path, local)
    with (out / 'ngspice.log').open('w') as log:
        subprocess.run(['ngspice', '-b', str(local.resolve())], cwd=out, stdout=log,
                       stderr=subprocess.STDOUT, check=True, timeout=30)
    return out


def chart(path, title, xname, yname, curves, xmax, ymax):
    # SVG produced from the actual solver data; no host plotting dependency.
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 450" role="img"><title>{escape(title)}</title>',
             '<rect width="700" height="450" rx="14" fill="#f4f7fa"/>',
             '<g font-family="sans-serif" fill="#20344c">',
             f'<text x="50" y="37" font-size="23">{escape(title)}</text>']
    for i in range(6):
        x, y = 75+i*112, 350-i*54
        parts += [f'<path d="M{x} 80 V350 M75 {y} H635" stroke="#d3dfe8"/>',
                  f'<text x="{x}" y="378" text-anchor="middle" font-size="17">{xmax*i/5:g}</text>',
                  f'<text x="62" y="{y+6}" text-anchor="end" font-size="17">{ymax*i/5:g}</text>']
    for n,(label,color,points) in enumerate(curves):
        poly = ' '.join(f'{75+x/xmax*560:.3f},{350-y/ymax*270:.3f}' for x,y in points)
        parts += [f'<polyline points="{poly}" fill="none" stroke="{color}" stroke-width="3"/>',
                  f'<text x="{90+n*230}" y="65" fill="{color}" font-size="18">{escape(label)}</text>']
    parts += [f'<text x="340" y="417" text-anchor="middle" font-size="20">{escape(xname)}</text>',
              f'<text x="20" y="235" transform="rotate(-90 20 235)" text-anchor="middle" font-size="20">{escape(yname)}</text>',
              '</g></svg>']
    path.write_text('\n'.join(parts)+'\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=False)
    lab = Path(__file__).resolve().parent
    report = {'engine': subprocess.check_output(['ngspice', '--version'], text=True),
              'scope': 'generic teaching models; numerical simulation, not a physical board test',
              'input_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in lab.glob('*.cir')},
              'checks': []}
    def check(name, actual, expected, tolerance):
        result = dict(name=name, actual=actual, expected=expected, absolute_tolerance=tolerance,
                      passed=math.isfinite(actual) and abs(actual-expected) <= tolerance)
        report['checks'].append(result)
    try:
        divider = simulate(lab/'01-divider.cir', out/'divider')
        row = data(divider/'divider.dat')[0]
        check('loaded divider output / V', row[1], 5/3, 1e-5)
        check('divider source current / A (SPICE sign)', row[2], -1/3000, 1e-8)
        # Predictable component change: removing load should restore 2.5 V.
        no_load = out/'divider-no-load.cir'
        no_load.write_text((lab/'01-divider.cir').read_text().replace('RL out 0 10k','* RL disconnected'))
        no_load_out = simulate(no_load, out/'divider-no-load')
        check('unloaded divider output / V', data(no_load_out/'divider.dat')[0][1], 2.5, 1e-5)

        led = simulate(lab/'02-led.cir', out/'led')
        row = data(led/'led-op.dat')[0]
        led_v, led_i = row[1], -row[2]
        check('LED loop KVL / V', led_v + led_i*1000, 5, 1e-5)
        # Independently solve the stated diode equation, including series R.
        thermal = 1.380649e-23 * 300.15 / 1.602176634e-19
        low, high = 0.0, .005
        for _ in range(100):
            current = (low+high)/2
            drop = 2*thermal*math.log1p(current/1e-20) + 5*current
            if 1000*current+drop > 5: high = current
            else: low = current
        check('LED model current vs independent equation / A', led_i, (low+high)/2, 2e-6)
        sweep = data(led/'led-sweep.dat')
        chart(out/'led-current.svg','LED: supply sweep (generic model)','Supply voltage / V','LED current / mA',
              [('ngspice','#287c78',[(r[0],r[2]*1000) for r in sweep])],5,4)

        rc = simulate(lab/'03-rc.cir', out/'rc')
        rows = data(rc/'rc.dat')
        def voltage_at(t):
            for a,b in zip(rows,rows[1:]):
                if a[0] <= t <= b[0]:
                    return a[2]+(b[2]-a[2])*(t-a[0])/(b[0]-a[0])
            raise RuntimeError('Missing transient interval')
        check('RC at 1 tau after edge / V', voltage_at(.011), 5*(1-math.exp(-1)), .002)
        check('RC at 5 tau after edge / V', voltage_at(.051), 5*(1-math.exp(-5)), .002)
        chart(out/'rc-transient.svg','RC: 10k ohm, 1uF, tau = 10 ms','Time / ms','Voltage / V',
              [('Input','#ba662b',[(r[0]*1000,r[1]) for r in rows]),
               ('Capacitor','#287c78',[(r[0]*1000,r[2]) for r in rows])],61,5.5)
        report['led_operating_point'] = {'voltage_V': led_v, 'current_mA': led_i*1000}
        report['passed'] = all(c['passed'] for c in report['checks'])
    except Exception as exc:
        report.update(passed=False,error=str(exc))
        raise
    finally:
        (out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    if not report['passed']:
        raise SystemExit('Numerical acceptance failed; inspect report.json')


if __name__ == '__main__':
    main()
