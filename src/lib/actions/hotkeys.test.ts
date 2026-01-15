/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hotkeys } from './hotkeys';

// Helper to create mock keyboard events
function createKeyboardEvent(key: string, options: {
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    target?: HTMLElement;
} = {}): KeyboardEvent {
    const { ctrlKey = false, metaKey = false, shiftKey = false, altKey = false, target } = options;

    const event = new KeyboardEvent('keydown', {
        key,
        ctrlKey,
        metaKey,
        shiftKey,
        altKey,
        bubbles: true,
    });

    // Override getModifierState for proper testing
    const originalGetModifierState = event.getModifierState.bind(event);
    Object.defineProperty(event, 'getModifierState', {
        value: (modifier: string) => {
            if (modifier === 'Control') return ctrlKey;
            if (modifier === 'Meta') return metaKey;
            if (modifier === 'Shift') return shiftKey;
            if (modifier === 'Alt') return altKey;
            return originalGetModifierState(modifier);
        },
    });

    // Set target if provided
    if (target) {
        Object.defineProperty(event, 'target', { value: target, writable: false });
    }

    return event;
}

// Helper to create mock elements
function createElement(tagName: string, contentEditable = false): HTMLElement {
    const element = document.createElement(tagName);
    if (contentEditable) {
        element.contentEditable = 'true';
        // Mock isContentEditable since jsdom doesn't handle it well
        Object.defineProperty(element, 'isContentEditable', {
            value: true,
            writable: false,
        });
    }
    return element;
}

describe('hotkeys action', () => {
    let node: HTMLElement;
    let handler: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        node = document.createElement('div');
        document.body.appendChild(node);
        handler = vi.fn();
    });

    afterEach(() => {
        document.body.removeChild(node);
    });

    describe('single key match', () => {
        it('fires handler when key matches (case-insensitive)', () => {
            hotkeys(node, { keys: ['a'], handler });

            node.dispatchEvent(createKeyboardEvent('a'));
            expect(handler).toHaveBeenCalledTimes(1);

            node.dispatchEvent(createKeyboardEvent('A'));
            expect(handler).toHaveBeenCalledTimes(2);
        });

        it('does not fire for non-matching key', () => {
            hotkeys(node, { keys: ['a'], handler });

            node.dispatchEvent(createKeyboardEvent('b'));
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('modifier: Control', () => {
        it('requires Control modifier when specified', () => {
            hotkeys(node, { keys: ['a'], modifiers: ['Control'], handler });

            node.dispatchEvent(createKeyboardEvent('a'));
            expect(handler).not.toHaveBeenCalled();

            node.dispatchEvent(createKeyboardEvent('a', { ctrlKey: true }));
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('modifier: Meta', () => {
        it('requires Meta modifier when specified', () => {
            hotkeys(node, { keys: ['a'], modifiers: ['Meta'], handler });

            node.dispatchEvent(createKeyboardEvent('a'));
            expect(handler).not.toHaveBeenCalled();

            node.dispatchEvent(createKeyboardEvent('a', { metaKey: true }));
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('modifier: Shift', () => {
        it('requires Shift modifier when specified', () => {
            hotkeys(node, { keys: ['a'], modifiers: ['Shift'], handler });

            node.dispatchEvent(createKeyboardEvent('a'));
            expect(handler).not.toHaveBeenCalled();

            node.dispatchEvent(createKeyboardEvent('a', { shiftKey: true }));
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('modifier: Alt', () => {
        it('requires Alt modifier when specified', () => {
            hotkeys(node, { keys: ['a'], modifiers: ['Alt'], handler });

            node.dispatchEvent(createKeyboardEvent('a'));
            expect(handler).not.toHaveBeenCalled();

            node.dispatchEvent(createKeyboardEvent('a', { altKey: true }));
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('modifier: CmdOrCtrl', () => {
        it('accepts Control for CmdOrCtrl', () => {
            hotkeys(node, { keys: ['a'], modifiers: ['CmdOrCtrl'], handler });

            node.dispatchEvent(createKeyboardEvent('a', { ctrlKey: true }));
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('accepts Meta for CmdOrCtrl', () => {
            hotkeys(node, { keys: ['a'], modifiers: ['CmdOrCtrl'], handler });

            node.dispatchEvent(createKeyboardEvent('a', { metaKey: true }));
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('does not fire when neither Control nor Meta held', () => {
            hotkeys(node, { keys: ['a'], modifiers: ['CmdOrCtrl'], handler });

            node.dispatchEvent(createKeyboardEvent('a'));
            expect(handler).not.toHaveBeenCalled();
        });

        it('fires when both Control and Meta held', () => {
            hotkeys(node, { keys: ['a'], modifiers: ['CmdOrCtrl'], handler });

            node.dispatchEvent(createKeyboardEvent('a', { ctrlKey: true, metaKey: true }));
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('multiple modifiers', () => {
        it('requires Control + Shift simultaneously', () => {
            hotkeys(node, { keys: ['a'], modifiers: ['Control', 'Shift'], handler });

            node.dispatchEvent(createKeyboardEvent('a', { ctrlKey: true }));
            expect(handler).not.toHaveBeenCalled();

            node.dispatchEvent(createKeyboardEvent('a', { shiftKey: true }));
            expect(handler).not.toHaveBeenCalled();

            node.dispatchEvent(createKeyboardEvent('a', { ctrlKey: true, shiftKey: true }));
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('requires CmdOrCtrl + Shift (Ctrl + Shift)', () => {
            hotkeys(node, { keys: ['a'], modifiers: ['CmdOrCtrl', 'Shift'], handler });

            node.dispatchEvent(createKeyboardEvent('a', { ctrlKey: true, shiftKey: true }));
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('requires CmdOrCtrl + Shift (Meta + Shift)', () => {
            hotkeys(node, { keys: ['a'], modifiers: ['CmdOrCtrl', 'Shift'], handler });

            node.dispatchEvent(createKeyboardEvent('a', { metaKey: true, shiftKey: true }));
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('modifier held but wrong key', () => {
        it('does not fire handler', () => {
            hotkeys(node, { keys: ['a'], modifiers: ['Control'], handler });

            node.dispatchEvent(createKeyboardEvent('b', { ctrlKey: true }));
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('correct key but missing modifier', () => {
        it('does not fire handler', () => {
            hotkeys(node, { keys: ['a'], modifiers: ['Control'], handler });

            node.dispatchEvent(createKeyboardEvent('a'));
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('enabledWhenEditing=false', () => {
        it('skips when target is INPUT', () => {
            hotkeys(node, { keys: ['a'], enabledWhenEditing: false, handler });

            const input = createElement('INPUT');
            const event = createKeyboardEvent('a', { target: input });

            node.dispatchEvent(event);
            expect(handler).not.toHaveBeenCalled();
        });

        it('skips when target is TEXTAREA', () => {
            hotkeys(node, { keys: ['a'], enabledWhenEditing: false, handler });

            const textarea = createElement('TEXTAREA');
            const event = createKeyboardEvent('a', { target: textarea });

            node.dispatchEvent(event);
            expect(handler).not.toHaveBeenCalled();
        });

        it('skips when target is contenteditable div', () => {
            hotkeys(node, { keys: ['a'], enabledWhenEditing: false, handler });

            const div = createElement('DIV', true);
            const event = createKeyboardEvent('a', { target: div });

            node.dispatchEvent(event);
            expect(handler).not.toHaveBeenCalled();
        });

        it('fires for non-editable div', () => {
            hotkeys(node, { keys: ['a'], enabledWhenEditing: false, handler });

            const div = createElement('DIV');
            const event = createKeyboardEvent('a', { target: div });

            node.dispatchEvent(event);
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('enabledWhenEditing=true (default)', () => {
        it('fires in INPUT fields', () => {
            hotkeys(node, { keys: ['a'], handler }); // enabledWhenEditing defaults to true

            const input = createElement('INPUT');
            const event = createKeyboardEvent('a', { target: input });

            node.dispatchEvent(event);
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('fires in TEXTAREA fields', () => {
            hotkeys(node, { keys: ['a'], handler });

            const textarea = createElement('TEXTAREA');
            const event = createKeyboardEvent('a', { target: textarea });

            node.dispatchEvent(event);
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('fires in contenteditable elements', () => {
            hotkeys(node, { keys: ['a'], handler });

            const div = createElement('DIV', true);
            const event = createKeyboardEvent('a', { target: div });

            node.dispatchEvent(event);
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('enabled=false', () => {
        it('never fires when disabled', () => {
            hotkeys(node, { keys: ['a'], enabled: false, handler });

            node.dispatchEvent(createKeyboardEvent('a'));
            node.dispatchEvent(createKeyboardEvent('a', { ctrlKey: true }));
            node.dispatchEvent(createKeyboardEvent('a', { metaKey: true }));

            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('keys array with multiple entries', () => {
        it('matches any key in array', () => {
            hotkeys(node, { keys: ['a', 'b', 'c'], handler });

            node.dispatchEvent(createKeyboardEvent('a'));
            expect(handler).toHaveBeenCalledTimes(1);

            node.dispatchEvent(createKeyboardEvent('b'));
            expect(handler).toHaveBeenCalledTimes(2);

            node.dispatchEvent(createKeyboardEvent('c'));
            expect(handler).toHaveBeenCalledTimes(3);

            node.dispatchEvent(createKeyboardEvent('d'));
            expect(handler).toHaveBeenCalledTimes(3); // No change
        });
    });

    describe('keys with different cases', () => {
        it('all case variants match', () => {
            hotkeys(node, { keys: ['enter', 'ENTER', 'Enter'], handler });

            node.dispatchEvent(createKeyboardEvent('Enter'));
            expect(handler).toHaveBeenCalledTimes(1);

            node.dispatchEvent(createKeyboardEvent('ENTER'));
            expect(handler).toHaveBeenCalledTimes(2);

            node.dispatchEvent(createKeyboardEvent('enter'));
            expect(handler).toHaveBeenCalledTimes(3);
        });
    });

    describe('handler receives KeyboardEvent', () => {
        it('passes the original event to handler', () => {
            hotkeys(node, { keys: ['a'], handler });

            const event = createKeyboardEvent('a');
            node.dispatchEvent(event);

            expect(handler).toHaveBeenCalledWith(expect.any(KeyboardEvent));
            expect(handler.mock.calls[0][0].key).toBe('a');
        });
    });

    describe('destroy() cleanup', () => {
        it('removes event listener', () => {
            const action = hotkeys(node, { keys: ['a'], handler });

            node.dispatchEvent(createKeyboardEvent('a'));
            expect(handler).toHaveBeenCalledTimes(1);

            action.destroy();

            node.dispatchEvent(createKeyboardEvent('a'));
            expect(handler).toHaveBeenCalledTimes(1); // No change
        });
    });

    describe('empty keys array', () => {
        it('never matches any key', () => {
            hotkeys(node, { keys: [], handler });

            node.dispatchEvent(createKeyboardEvent('a'));
            node.dispatchEvent(createKeyboardEvent('Enter'));
            node.dispatchEvent(createKeyboardEvent('Escape'));

            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('special keys', () => {
        it('matches ArrowUp', () => {
            hotkeys(node, { keys: ['ArrowUp'], handler });

            node.dispatchEvent(createKeyboardEvent('ArrowUp'));
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('matches ArrowDown', () => {
            hotkeys(node, { keys: ['ArrowDown'], handler });

            node.dispatchEvent(createKeyboardEvent('ArrowDown'));
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('matches Escape', () => {
            hotkeys(node, { keys: ['Escape'], handler });

            node.dispatchEvent(createKeyboardEvent('Escape'));
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('matches Tab', () => {
            hotkeys(node, { keys: ['Tab'], handler });

            node.dispatchEvent(createKeyboardEvent('Tab'));
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('matches Backspace', () => {
            hotkeys(node, { keys: ['Backspace'], handler });

            node.dispatchEvent(createKeyboardEvent('Backspace'));
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('matches Enter', () => {
            hotkeys(node, { keys: ['Enter'], handler });

            node.dispatchEvent(createKeyboardEvent('Enter'));
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('matches Space', () => {
            hotkeys(node, { keys: [' '], handler });

            node.dispatchEvent(createKeyboardEvent(' '));
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('matches F1-F12 keys', () => {
            hotkeys(node, { keys: ['F1', 'F12'], handler });

            node.dispatchEvent(createKeyboardEvent('F1'));
            expect(handler).toHaveBeenCalledTimes(1);

            node.dispatchEvent(createKeyboardEvent('F12'));
            expect(handler).toHaveBeenCalledTimes(2);
        });
    });

    describe('complex scenarios', () => {
        it('handles Ctrl+Shift+S', () => {
            hotkeys(node, { keys: ['s'], modifiers: ['Control', 'Shift'], handler });

            node.dispatchEvent(createKeyboardEvent('s', { ctrlKey: true, shiftKey: true }));
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('handles CmdOrCtrl+Enter', () => {
            hotkeys(node, { keys: ['Enter'], modifiers: ['CmdOrCtrl'], handler });

            node.dispatchEvent(createKeyboardEvent('Enter', { ctrlKey: true }));
            expect(handler).toHaveBeenCalledTimes(1);

            node.dispatchEvent(createKeyboardEvent('Enter', { metaKey: true }));
            expect(handler).toHaveBeenCalledTimes(2);
        });

        it('handles multiple keys with modifier', () => {
            hotkeys(node, { keys: ['ArrowUp', 'ArrowDown'], modifiers: ['Control'], handler });

            node.dispatchEvent(createKeyboardEvent('ArrowUp', { ctrlKey: true }));
            expect(handler).toHaveBeenCalledTimes(1);

            node.dispatchEvent(createKeyboardEvent('ArrowDown', { ctrlKey: true }));
            expect(handler).toHaveBeenCalledTimes(2);

            // Without modifier - should not fire
            node.dispatchEvent(createKeyboardEvent('ArrowUp'));
            expect(handler).toHaveBeenCalledTimes(2);
        });
    });
});
