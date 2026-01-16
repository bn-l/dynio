/**
 * Reads coverage JSON from frontend (vitest) and rust (cargo-llvm-cov),
 * fetches SVG badges from shields.io, and writes them to assets-repo/.
 */

import fs from 'node:fs';
import path from 'node:path';

const ASSETS_DIR = path.join(import.meta.dirname, '..', 'assets-repo');
const COVERAGE_DIR = path.join(import.meta.dirname, '..', 'coverage');

interface CoverageResult {
    name: string;
    percentage: number | null;
    error?: string;
}

function getColor(pct: number): string {
    if (pct < 50) return 'red';
    if (pct < 80) return 'yellow';
    return 'brightgreen';
}

function readFrontendCoverage(): CoverageResult {
    const summaryPath = path.join(COVERAGE_DIR, 'frontend', 'coverage-summary.json');

    if (!fs.existsSync(summaryPath)) {
        return { name: 'frontend', percentage: null, error: 'coverage-summary.json not found' };
    }

    const data = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    const pct = data?.total?.lines?.pct;

    if (typeof pct !== 'number') {
        return { name: 'frontend', percentage: null, error: 'Could not parse lines.pct from coverage-summary.json' };
    }

    return { name: 'frontend', percentage: Math.round(pct * 10) / 10 };
}

function readRustCoverage(): CoverageResult {
    const coveragePath = path.join(COVERAGE_DIR, 'rust', 'coverage.json');

    if (!fs.existsSync(coveragePath)) {
        return { name: 'rust', percentage: null, error: 'coverage.json not found' };
    }

    const data = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
    const pct = data?.data?.[0]?.totals?.lines?.percent;

    if (typeof pct !== 'number') {
        return { name: 'rust', percentage: null, error: 'Could not parse lines.percent from coverage.json' };
    }

    return { name: 'rust', percentage: Math.round(pct * 10) / 10 };
}

async function fetchBadgeSvg(label: string, pct: number): Promise<string> {
    const color = getColor(pct);
    const message = `${pct}%25`; // URL encode the %
    const url = `https://img.shields.io/badge/${encodeURIComponent(label)}-${message}-${color}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch badge: ${response.status} ${response.statusText}`);
    }

    return response.text();
}

async function main() {
    console.log('Reading coverage data...\n');

    const frontend = readFrontendCoverage();
    const rust = readRustCoverage();

    const results = [frontend, rust];

    for (const result of results) {
        if (result.error) {
            console.log(`[${result.name}] Skipped: ${result.error}`);
            continue;
        }

        if (result.percentage === null) continue;

        console.log(`[${result.name}] Coverage: ${result.percentage}%`);

        const label = result.name === 'frontend' ? 'frontend coverage' : 'rust coverage';
        const svg = await fetchBadgeSvg(label, result.percentage);

        const outputPath = path.join(ASSETS_DIR, `coverage-${result.name}.svg`);
        fs.writeFileSync(outputPath, svg);
        console.log(`[${result.name}] Badge written to: ${outputPath}`);
    }

    console.log('\nDone.');
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
