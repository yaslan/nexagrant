'use client';
type F = () => Promise<string>;
export function Probe(p: { run: F; act: F; actReq: F; actModReq: F; actCreq: F; actReqAs: F }) {
  return (
    <div>
      {Object.entries(p).map(([k, f]) => (
        <button key={k} id={k} onClick={async () => { const r = await f(); document.title = `${k}:${r}`; }}>{k}</button>
      ))}
    </div>
  );
}
