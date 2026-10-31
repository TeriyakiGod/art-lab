/** The museum canvas, set once the 3D scene mounts. Kept apart from the scene so the UI can import it cheaply. */
let canvas: HTMLCanvasElement | null = null;

export const setMuseumCanvas = (c: HTMLCanvasElement | null) => void (canvas = c);

/** Starts walking; must run inside a click or key press (browsers require a user gesture). */
export const lockPointer = () => void canvas?.requestPointerLock();
