import { vi } from 'vitest';
import { get } from 'svelte/store';
import { scrollContainer } from '../../src/lib/stores/globals';

/**
 * jsdom can't scroll, so this replaces scrollBy on the mounted panel (the element
 * DisplayWrapper puts in $scrollContainer) with a mock, and returns the mock.
 */
export function stubPanelScroll() {
    const panel = get(scrollContainer);
    if (!panel) throw new Error('No panel in $scrollContainer. Is a DisplayWrapper mounted?');
    const scrollBy = vi.fn();
    panel.scrollBy = scrollBy;
    return scrollBy;
}
