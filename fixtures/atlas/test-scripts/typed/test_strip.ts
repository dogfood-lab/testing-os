const total: number = [1, 2].reduce((sum, value) => sum + value, 0);
if (total !== 3) process.exit(1);
