import { useState, useRef, ReactNode } from "react";

type SwipeableCardProps = {
  children: ReactNode[];
  title?: string;
  onIndexChange?: (index: number) => void;
};

export function SwipeableCard({ children, title, onIndexChange }: SwipeableCardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startXRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalCards = children.length;
  const canSwipeLeft = currentIndex < totalCards - 1;
  const canSwipeRight = currentIndex > 0;

  function handleTouchStart(e: React.TouchEvent) {
    setIsDragging(true);
    startXRef.current = e.touches[0].clientX;
    setDragOffset(0);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isDragging) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - startXRef.current;
    setDragOffset(diff);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    setIsDragging(false);
    const currentX = e.changedTouches[0].clientX;
    const diff = currentX - startXRef.current;
    const threshold = 50; // minimum swipe distance

    if (Math.abs(diff) > threshold) {
      if (diff > 0 && canSwipeRight) {
        // Swiped right
        const newIndex = currentIndex - 1;
        setCurrentIndex(newIndex);
        onIndexChange?.(newIndex);
      } else if (diff < 0 && canSwipeLeft) {
        // Swiped left
        const newIndex = currentIndex + 1;
        setCurrentIndex(newIndex);
        onIndexChange?.(newIndex);
      }
    }
    setDragOffset(0);
  }

  function goToPrevious() {
    if (canSwipeRight) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      onIndexChange?.(newIndex);
    }
  }

  function goToNext() {
    if (canSwipeLeft) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      onIndexChange?.(newIndex);
    }
  }

  return (
    <div className="d-flex flex-column gap-3">
      {title ? <div className="signalto-list-label">{title}</div> : null}

      <div
        ref={containerRef}
        className="position-relative overflow-hidden"
        style={{
          touchAction: "pan-y",
          userSelect: "none"
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          style={{
            display: "flex",
            transform: `translateX(calc(-${currentIndex * 100}% + ${dragOffset}px))`,
            transition: isDragging ? "none" : "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            width: `${totalCards * 100}%`
          }}
        >
          {children.map((child, idx) => (
            <div key={idx} style={{ width: `${100 / totalCards}%`, flexShrink: 0 }} className="px-2">
              {child}
            </div>
          ))}
        </div>
      </div>

      {/* Navigation indicators and buttons */}
      <div className="d-flex align-items-center justify-content-between gap-3">
        <button
          type="button"
          className="btn btn-sm signalto-btn-ghost rounded-pill px-3"
          onClick={goToPrevious}
          disabled={!canSwipeRight}
        >
          <i className="bi bi-chevron-left" aria-hidden="true" />
          Previous
        </button>

        <div className="d-flex gap-2 justify-content-center flex-grow-1">
          {Array.from({ length: totalCards }).map((_, idx) => (
            <button
              key={idx}
              type="button"
              className={`btn btn-sm rounded-pill ${
                idx === currentIndex
                  ? "btn-primary signalto-btn-primary"
                  : "btn-outline-secondary signalto-btn-ghost"
              }`}
              style={{ width: "8px", height: "8px", padding: 0 }}
              onClick={() => {
                setCurrentIndex(idx);
                onIndexChange?.(idx);
              }}
              aria-label={`Go to card ${idx + 1}`}
            />
          ))}
        </div>

        <button
          type="button"
          className="btn btn-sm signalto-btn-ghost rounded-pill px-3"
          onClick={goToNext}
          disabled={!canSwipeLeft}
        >
          Next
          <i className="bi bi-chevron-right ms-2" aria-hidden="true" />
        </button>
      </div>

      {/* Counter */}
      <div className="text-center small signalto-subtle">
        {currentIndex + 1} of {totalCards}
      </div>
    </div>
  );
}
