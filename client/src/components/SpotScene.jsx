import { toScenePoint } from '../pages/spotLogic';
import { SpotBackground, SpotObject } from './spotObjects';

// One of the two pictures. `marks` are the rings to draw; `flashes` are the
// short-lived "−3s" notes for wrong taps made in this picture.
export function SpotScene({ label, theme, sceneObjects, marks, flashes = [], onTap, disabled }) {
  // A click, not a pointer-down: a finger that starts a scroll or a pinch on
  // the picture presses down too, and must not be judged as a wrong tap.
  function handleClick(e) {
    if (disabled || !onTap) return;
    // Measured on every tap: the picture moves and resizes when the phone
    // is rotated or the window changes.
    const rect = e.currentTarget.getBoundingClientRect();
    onTap({ ...toScenePoint(e.clientX, e.clientY, rect), label });
  }

  return (
    <figure className="spot-picture">
      <figcaption className="spot-picture-label">{label}</figcaption>
      <svg
        className={`spot-picture-svg${disabled ? ' disabled' : ''}`}
        viewBox="0 0 400 300"
        role="img"
        aria-label={`Picture ${label}`}
        onClick={handleClick}
      >
        <defs>
          <clipPath id="spot-ball-clip">
            <circle r="11.4" />
          </clipPath>
        </defs>
        <SpotBackground theme={theme} />
        {sceneObjects.map((object) => (
          <SpotObject key={object.id} object={object} />
        ))}
        {marks.map((mark) => (
          <circle
            key={mark.index}
            className={`spot-mark ${mark.style}`}
            cx={mark.x}
            cy={mark.y}
            r={mark.r}
          />
        ))}
        {flashes.map((flash) => (
          <text key={flash.id} className="spot-flash" x={flash.x} y={flash.y} textAnchor="middle">
            −3s
          </text>
        ))}
      </svg>
    </figure>
  );
}
