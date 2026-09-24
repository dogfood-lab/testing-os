import { store } from '@ws/state';
import { shape } from '@ws/domain';
import { ignored } from '@ws/ignored';
import { createElement } from 'react';
import pad from 'left-pad';
import { version } from 'astro:content';

export const view = createElement('div', null, store(shape(pad(String(ignored), 2))), version);
