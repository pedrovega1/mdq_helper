#!/usr/bin/env node

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('Password Hash Generator\n');

rl.question('Enter admin password (minimum 8 characters): ', async (password) => {
    if (!password || password.length < 8) {
        console.error('\nError: Password must be at least 8 characters');
        rl.close();
        process.exit(1);
    }

    try {
        console.log('\nGenerating password hash...\n');
        
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);
        
        const jwtSecret = crypto.randomBytes(32).toString('hex');
        
        console.log('Successfully generated!\n');
        console.log('Copy these lines to your .env file:\n');
        console.log('----------------------------------------');
        console.log(`ADMIN_PASSWORD_HASH=${hash}`);
        console.log(`JWT_SECRET=${jwtSecret}`);
        console.log('----------------------------------------\n');
        
        console.log('Important:');
        console.log('1. Remove the old API_KEY from .env');
        console.log('2. Add these two new variables');
        console.log('3. Restart the server: node server/server.js');
        console.log('4. Use your original password to login\n');
        
        const isValid = await bcrypt.compare(password, hash);
        if (isValid) {
            console.log('Hash verification: OK\n');
        } else {
            console.log('Hash verification: Failed\n');
        }
        
    } catch (error) {
        console.error('\nGeneration error:', error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
});

rl.on('close', () => {
    process.exit(0);
});
