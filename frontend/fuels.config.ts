import { createConfig } from 'fuels';

export default createConfig({
  contracts: [
        '../contract',
  ],
  output: './src/contracts',
});

/**
 * Check the docs:
 * https://docs.fuel.network/docs/fuels-ts/fuels-cli/config-file/
 */
