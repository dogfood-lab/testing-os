import { z } from 'zod';
import { shared } from '@px/shared';
import { render } from 'react-dom';
import synth from 'vocal-synth-engine';

export const schema = z.object({ shared, render, synth });
