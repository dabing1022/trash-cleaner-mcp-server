export const DANGEROUS_PATHS = [
  "/", "/bin", "/usr", "/etc", "/System", "/Windows", "/home", "/var", "/root"
];
export const DANGEROUS_FILENAMES = [
  ".bashrc", ".zshrc", ".profile", ".env", "package.json", "id_rsa", "passwd"
];
export const DANGEROUS_EXTS = [
  ".exe", ".sh", ".bat", ".cmd", ".dll", ".so", ".conf", ".ini", ".yaml", ".yml"
];

export function isDangerousTarget(filePath: string): boolean {
  const path = require("path");
  const normalized = path.resolve(filePath);
  const ext = path.extname(normalized).toLowerCase();
  const base = path.basename(normalized);

  if (DANGEROUS_PATHS.some(p => normalized === p || normalized.startsWith(p + "/"))) return true;
  if (DANGEROUS_FILENAMES.includes(base)) return true;
  if (DANGEROUS_EXTS.includes(ext)) return true;
  return false;
}
