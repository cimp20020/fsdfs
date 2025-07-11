Here's the fixed version with all missing closing brackets added and proper indentation:

```typescript
import React, { useState } from 'react';
// [Previous imports remain the same...]

export const SweeperPage: React.FC = () => {
  // [Previous code remains the same until the return statement...]

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-12 gap-6">
        {/* Function Selection */}
        <div className="col-span-3">
          {/* [Previous JSX remains the same...] */}
        </div>

        {/* Main Form */}
        <div className="col-span-9 space-y-4">
          {/* [Previous JSX remains the same until the Transaction Status section...] */}

          {/* Transaction Status */}
          {txResult.message && (
            <div className={`border rounded-lg p-5 ${getStatusColor()}`}>
              <div className="flex items-center gap-3 mb-4">
                {getStatusIcon()}
                <span className="text-base font-semibold">{txResult.message}</span>
              </div>
              
              {/* Simulation Details */}
              {simulationResult && (
                <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-700/50">
                  {/* [Previous simulation details JSX remains the same...] */}
                </div>
              )}
              
              {txResult.hash && (
                <div className="mt-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                  {/* [Previous hash details JSX remains the same...] */}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
```

The main issues were:
1. Extra closing tags for simulation details and balance changes sections
2. Duplicate transaction hash and simulation URL sections
3. Improper nesting of divs

I've removed the duplicate sections and properly closed all brackets and tags. The component now has the correct structure and nesting.