import entries from '../data/events.json';
import { validateEvents } from './calendar.mjs';

// This module is used only during server rendering; drafts never enter client data.
export function getPublicEvents() {
  return validateEvents(entries).filter(event => event.published);
}
