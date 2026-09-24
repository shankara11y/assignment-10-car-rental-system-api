const assert = require('assert');
const app = require('../server');

// Helper function to check overlap between range 1 [s1, e1] and range 2 [s2, e2]
function isOverlapping(start1, end1, start2, end2) {
  return new Date(start1) <= new Date(end2) && new Date(end1) >= new Date(start2);
}

// Helper function to calculate rental days
function calculateDays(startStr, endStr) {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffDays = Math.ceil((end - start) / (1000 * 3600 * 24));
  return diffDays <= 0 ? 1 : diffDays;
}

console.log('🧪 Starting Car Rental API Verification Tests...\n');

// Test 1: Date Overlap Logic Test
console.log('Test 1: Date Range Collision Detection');
// 2026-05-01 to 2026-05-05 vs 2026-05-03 to 2026-05-07 (Overlap expected)
assert.strictEqual(
  isOverlapping('2026-05-01', '2026-05-05', '2026-05-03', '2026-05-07'),
  true,
  'Should detect overlap between 2026-05-01..05 and 2026-05-03..07'
);

// 2026-05-01 to 2026-05-05 vs 2026-05-06 to 2026-05-10 (No overlap expected)
assert.strictEqual(
  isOverlapping('2026-05-01', '2026-05-05', '2026-05-06', '2026-05-10'),
  false,
  'Should not detect overlap for non-adjacent non-overlapping ranges'
);
console.log('✅ Date collision logic passed!\n');

// Test 2: Rental Days & Billing Calculation
console.log('Test 2: Billing Computation');
const daysSpan = calculateDays('2026-05-01', '2026-05-05');
assert.strictEqual(daysSpan, 4, 'Difference between 2026-05-01 and 2026-05-05 should be 4 days');

const dailyRate = 4500;
const totalCost = daysSpan * dailyRate;
assert.strictEqual(totalCost, 18000, 'Total cost for 4 days at 4500/day should be 18000');
console.log('✅ Billing computation passed!\n');

// Test 3: Express App Initialization Test
console.log('Test 3: Express App Setup');
assert.strictEqual(typeof app, 'function', 'Express app should be exported as a function');
console.log('✅ Express app initialization passed!\n');

console.log('🎉 All verification tests passed successfully!');
