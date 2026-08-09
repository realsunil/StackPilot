const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');

const extractZip = async (zipPath, extractTo) => {
  try {
    await fs.ensureDir(extractTo);
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractTo, true);

    // Check if extracted into a single subfolder (common with GitHub zips)
    const items = await fs.readdir(extractTo);
    if (items.length === 1) {
      const singleDir = path.join(extractTo, items[0]);
      const stat = await fs.stat(singleDir);
      if (stat.isDirectory()) {
        // Move contents up one level
        const subItems = await fs.readdir(singleDir);
        for (const item of subItems) {
          await fs.move(
            path.join(singleDir, item),
            path.join(extractTo, item),
            { overwrite: true }
          );
        }
        await fs.remove(singleDir);
      }
    }

    return extractTo;
  } catch (error) {
    throw new Error(`Extraction failed: ${error.message}`);
  }
};

const cleanupPath = async (dirPath) => {
  try {
    if (await fs.pathExists(dirPath)) {
      await fs.remove(dirPath);
    }
  } catch (error) {
    console.error(`Cleanup failed for ${dirPath}: ${error.message}`);
  }
};

const getDirectoryTree = async (dirPath, depth = 2, current = 0) => {
  if (current >= depth) return [];

  const items = await fs.readdir(dirPath);
  const tree = [];

  for (const item of items) {
    if (item === 'node_modules' || item === '.git' || item === '__pycache__') continue;

    const fullPath = path.join(dirPath, item);
    const stat = await fs.stat(fullPath);

    const node = {
      name: item,
      type: stat.isDirectory() ? 'directory' : 'file',
      path: fullPath
    };

    if (stat.isDirectory()) {
      node.children = await getDirectoryTree(fullPath, depth, current + 1);
    }

    tree.push(node);
  }

  return tree;
};

module.exports = { extractZip, cleanupPath, getDirectoryTree };