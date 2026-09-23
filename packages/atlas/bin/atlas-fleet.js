#!/usr/bin/env node
// The container's default command: serve the fleet from /data and map it on
// the schedule in /data/fleet.yml. ATLAS_DATA and ATLAS_ASSETS move the two
// directories, for running the service outside the image.
import { redact, startFleetService } from '../adapter/fleet.js';

const dataDir = process.env.ATLAS_DATA || '/data';
const assetsDir = process.env.ATLAS_ASSETS || '/srv/atlas';

try {
  const service = await startFleetService({ dataDir, assetsDir });
  const stop = async () => {
    await service.stop();
    process.exit(0);
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
} catch (error) {
  process.stdout.write(`atlas-fleet: ${redact(error.message)}\nexit 2\n`);
  process.exit(2);
}
