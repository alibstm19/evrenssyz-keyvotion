const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPORT_PATH = path.join(process.cwd(), 'work', 'k3-report.txt');

async function runK3() {
    console.log('Starting K3 Quality Gate...');
    let report = `K3 QUALITY GATE REPORT\nDate: ${new Date().toISOString()}\n${'='.repeat(30)}\n\n`;
    let overallSuccess = true;

    // Step 1: Doctor
    console.log('Running System Doctor...');
    try {
        const docOut = execSync('node tools/doctor.js', { encoding: 'utf8' });
        report += `[DOCTOR]\n${docOut}\n\n`;
        console.log('[+] Doctor passed.');
    } catch (e) {
        overallSuccess = false;
        report += `[DOCTOR - FAILED]\n${e.stdout || e.message}\n\n`;
        console.error('[-] Doctor failed.');
    }

    // Step 2: Tests
    console.log('Running Unit Tests...');
    try {
        const testOut = execSync('node --test tests/', { encoding: 'utf8' });
        report += `[TESTS]\n${testOut}\n\n`;
        console.log('[+] All tests passed.');
    } catch (e) {
        overallSuccess = false;
        report += `[TESTS - FAILED]\n${e.stdout || e.message}\n\n`;
        console.error('[-] Some tests failed.');
    }

    report += `\nFINAL STATUS: ${overallSuccess ? 'PASSED' : 'FAILED'}`;
    fs.writeFileSync(REPORT_PATH, report);
    
    if (overallSuccess) {
        console.log('K3 Gate Passed Successfully!');
        process.exit(0);
    } else {
        console.error('K3 Gate Failed. See work/k3-report.txt for details.');
        process.exit(1);
    }
}

runK3();
