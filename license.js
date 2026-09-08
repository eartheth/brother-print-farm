const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Put ONLY your PUBLIC key here. Never ship the private key with the employee app.
const PUBLIC_KEY_PEM = fs.readFileSync(
  path.join(__dirname, 'public-key.pem'),
  'utf8'
);

function ps(command) {
  try { return execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { encoding: 'utf8', windowsHide: true }).trim(); }
  catch { return ''; }
}
function stable(value) { return String(value || '').trim().toUpperCase(); }
function machineFacts() {
  const machineGuid = ps(`(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid`);
  const bios = ps(`(Get-CimInstance Win32_BIOS).SerialNumber`);
  const board = ps(`(Get-CimInstance Win32_BaseBoard).SerialNumber`);
  const uuid = ps(`(Get-CimInstance Win32_ComputerSystemProduct).UUID`);
  return { machineGuid, bios, board, uuid, hostname: os.hostname() };
}
function getMachineId() {
  const f = machineFacts();
  const raw = [f.machineGuid, f.bios, f.board, f.uuid].map(stable).join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
}
function getNetwork() {
  const nets = os.networkInterfaces();
  const ipv4 = [];
  for (const list of Object.values(nets)) for (const n of (list || [])) if (n.family === 'IPv4' && !n.internal) ipv4.push(n.address);
  return ipv4;
}
function ipToInt(ip) { return ip.split('.').reduce((a, v) => ((a << 8) + Number(v)) >>> 0, 0); }
function cidrMatch(ip, cidr) {
  try { const [net, bitsText] = cidr.split('/'); const bits = Number(bitsText); if (bits < 0 || bits > 32) return false; const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0; return (ipToInt(ip) & mask) === (ipToInt(net) & mask); } catch { return false; }
}
function canonical(payload) { return JSON.stringify(payload, Object.keys(payload).sort()); }
function verifySignature(payload, signature) {
  try { return crypto.verify('sha256', Buffer.from(canonical(payload)), PUBLIC_KEY_PEM, Buffer.from(signature, 'base64')); } catch { return false; }
}
function licensePath(app) {
  return path.join(
    process.env.ProgramData || "C:\\ProgramData",
    "BrotherPrintFarm",
    "BrotherPrintFarm.lic"
  );
}

function readLicense(app) {
  try {
    return JSON.parse(
      fs.readFileSync(
        licensePath(app),
        "utf8"
      )
    );
  } catch {
    return null;
  }
}
function validateLicense(app) {
  const machineId = getMachineId(), ips = getNetwork(), doc = readLicense(app);
  if (!doc) return { ok: false, reason: 'NO_LICENSE', machineId, ips };
  if (!doc.payload || !doc.signature || !verifySignature(doc.payload, doc.signature)) return { ok: false, reason: 'BAD_SIGNATURE', machineId, ips };
  const p = doc.payload;
  if (stable(p.machineId) !== stable(machineId)) return { ok: false, reason: 'WRONG_DEVICE', machineId, ips };
  if (p.expiresAt && Date.now() > Date.parse(p.expiresAt)) return { ok: false, reason: 'EXPIRED', machineId, ips };
  if (Array.isArray(p.allowedCidrs) && p.allowedCidrs.length && !ips.some(ip => p.allowedCidrs.some(c => cidrMatch(ip, c)))) return { ok: false, reason: 'WRONG_NETWORK', machineId, ips };
  return { ok: true, machineId, ips, payload: p };
}
function installLicense(app, sourcePath) {
  JSON.parse(
    fs.readFileSync(
      sourcePath,
      'utf8'
    )
  );

  const dest =
    licensePath(app);
  fs.mkdirSync(
    path.dirname(dest),
    { recursive: true }
  );
  fs.copyFileSync(
    sourcePath,
    dest
  );

  try {
    execFileSync(
      'attrib.exe',
      ['+H', '+S', dest],
      { windowsHide: true }
    );
  } catch { }

  const result =
    validateLicense(app);

  if (!result.ok) {
    try {
      fs.unlinkSync(dest);
    } catch { }

    throw new Error(
      result.reason
    );
  }

  return result;
}
module.exports = { getMachineId, getNetwork, validateLicense, installLicense, licensePath };
