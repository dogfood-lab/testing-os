if (process.argv.includes('--bad')) throw new Error('sweep refused');
console.log('swept');
