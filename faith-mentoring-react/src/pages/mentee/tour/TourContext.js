import { createContext, useContext } from 'react';

// The Mentee walkthrough (tour/Walkthrough.jsx) shows SAMPLE data on each page while it runs.
// Pages read this to render the sample instead of their real lists; nothing real is changed.
export const TourContext = createContext({ sample: false, annTab: 'admin', scheduleApproved: false, scheduleModal: false, start: () => {} });
export const useTour = () => useContext(TourContext);
