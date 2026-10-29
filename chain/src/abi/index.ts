import { InterfaceAbi } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.resolve(__dirname, './StockFoilRegistry.json');
export const StockFoilRegistryAbi: InterfaceAbi = JSON.parse(
  fs.readFileSync(jsonPath, 'utf-8')
);
