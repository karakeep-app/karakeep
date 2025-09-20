# Rediscover Feed Feature

## Overview

The Rediscover Feed is a mobile-first feature designed to help users rediscover forgotten bookmarks through a Tinder-style swipe interface. This feature addresses the common problem of valuable bookmarks getting buried under newer additions in large collections.

## Inspiration

Based on [GitHub Issue #435](https://github.com/karakeep-app/karakeep/issues/435) - "Add Random Bookmarks View to rediscover forgotten links". Similar to how platforms like Google Photos highlight past memories, this feature brings forgotten but potentially valuable bookmarks back into view.

## Feature Requirements

### Core Functionality

- **Mobile-first design**: Only renders on mobile screens (web implementation, not native)
- **Tinder-style interface**: Card-based swipe interactions
- **Bookmark rediscovery**: Helps users engage with older, forgotten bookmarks
- **Cross-platform sync**: Discovery queue synced across mobile, web, and sessions

### User Eligibility

- **Minimum requirement**: Users must have 10+ unarchived bookmarks
- **Insufficient bookmarks message**: "You are a very organised bookmark connoisseur! Come back again after you make mess!"

## Swipe Interactions

### Gesture Mapping

| Gesture | Action | Animation | Remove from Feed | Update lastRediscoveredAt | Show Undo |
|---------|--------|-----------|------------------|---------------------------|------------|
| **Swipe Left** | Archive bookmark | Flick-left animation | ✅ Yes | ✅ Yes | ✅ Yes |
| **Swipe Right** | Quick actions (Phase 2) | Flick-right animation | ✅ Yes | ✅ Yes | ✅ Yes |
| **Swipe Up** | Skip bookmark | Slide-up animation | ✅ Yes | ✅ Yes | ❌ No |
| **Swipe Down** | Return to previous | Slide-down animation | ❌ No | ❌ No | ❌ No |

### Swipe Behavior Details

- **Left/Right swipes**: Trigger fancy flick animations and remove card from feed
- **Up/Down swipes**: Simple navigation between cards in the current queue
- **Swipe down**: Special case - returns to previously skipped bookmark without updating timestamps

## Data Architecture

### Database Schema Changes

#### Bookmarks Table Addition
```sql
ALTER TABLE bookmarks ADD COLUMN lastRediscoveredAt INTEGER; -- timestamp
```

#### Discovery Queue Table
```sql
CREATE TABLE discoveryQueue (
  userId TEXT NOT NULL,
  bookmarkId TEXT NOT NULL,
  addedAt INTEGER NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (userId, bookmarkId),
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (bookmarkId) REFERENCES bookmarks(id)
);
```

### Algorithm Specifications

#### Bookmark Selection Criteria
- **Include**: Unarchived bookmarks only
- **Exclude**: Bookmarks processed within 90 days (`lastRediscoveredAt`)
- **Ordering**: Oldest first (by `createdAt`) to prioritize forgotten content
- **Batch size**: Always 10 bookmarks per queue

#### Selection Logic
```typescript
function selectBookmarksForDiscovery(userId: string) {
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
  const excludeThreshold = Date.now() - NINETY_DAYS_MS;
  
  const bookmarks = db.bookmarks.findMany({
    where: {
      userId,
      archived: false,
      OR: [
        { lastRediscoveredAt: null },
        { lastRediscoveredAt: { lt: excludeThreshold } }
      ]
    },
    orderBy: { createdAt: 'asc' },
    take: 10
  });
  
  // Randomize order for variety while maintaining oldest-first selection
  return shuffleArray(bookmarks);
}
```

### Queue Management

#### Initial Load
1. Server selects 10 eligible bookmarks
2. Bookmarks are flagged in `discoveryQueue` table
3. Queue synced across all user sessions

#### Queue Depletion
- When feed is cleared → server automatically picks next 10 bookmarks
- Manual refresh available anytime via "regen feed" action

#### Queue Persistence
- **No auto-expiry**: Queues persist indefinitely
- **User control**: Manual regeneration available
- **Cross-session**: Queue maintained across logins

## User Interface

### Layout Design
- **Base**: Similar to existing bookmark grid but optimized for swipe interactions
- **Presentation**: One card at a time (Tinder-style)
- **Responsive**: Mobile-only rendering (hidden on desktop)

### Undo Functionality
- **Position**: Top left corner of screen
- **Visibility**: Only appears after left/right swipe actions
- **Persistence**: Disappears after any subsequent action
- **Scope**: Only undoes the most recent action

### State Management
```typescript
interface RediscoveryState {
  currentCardIndex: number;
  cards: ZBookmark[];
  lastAction: {
    type: 'archive' | 'quickActions' | null;
    bookmarkId: string;
    timestamp: number;
  } | null;
  showUndo: boolean;
}
```

## API Endpoints

### Required Endpoints
1. `getDiscoveryFeed()` - Retrieve current discovery queue
2. `processSwipeAction(bookmarkId, direction)` - Handle swipe actions
3. `regenerateDiscoveryFeed()` - Manual queue refresh
4. `undoLastAction()` - Undo most recent swipe action
5. `getNextBatch()` - Auto-refill when queue depletes
6. `resetRediscoveryHistory()` - Reset all lastRediscoveredAt timestamps
7. `canAccess()` - Check eligibility and rediscovery status

## Implementation Phases

### Phase 1 (Initial Implementation)
- ✅ Database schema changes
- ✅ API endpoints for queue management
- ✅ Basic swipe detection and animations
- ✅ Archive functionality (left swipe)
- ✅ Card navigation (up/down swipes)
- ✅ Undo functionality
- ✅ Mobile-optimized rendering
- ✅ Enhanced empty state handling ("All Caught Up!" scenario)
- ✅ Reset rediscovery history functionality
- ✅ Randomized bookmark order for variety
- ✅ Reduced toast duration for skip actions
- 🔄 Placeholder for right swipe (future quick actions)

### Phase 2 (Future Enhancement)
- Quick actions interface (right swipe)
- Tag and list management UI
- Advanced animations and polish
- Analytics and usage tracking

## Technical Considerations

### Animation Libraries
- **Web**: `framer-motion` for smooth gesture animations
- **React Native**: `react-native-reanimated` or built-in `Animated` API

### Gesture Detection
- **Web**: Custom touch/mouse event handlers or gesture library
- **React Native**: `react-native-gesture-handler`

### Performance
- **Pre-loading**: Queue of 10 bookmarks loaded for smooth swiping
- **Immediate persistence**: Swipe actions immediately saved to database
- **Optimistic updates**: UI updates before server confirmation

### Component Structure
```
RediscoveryScreen/
├── RediscoveryCard (swipeable bookmark card)
├── UndoButton (conditional render)
├── EmptyState (when no cards available)
└── LoadingState (while fetching cards)
```

## Future Considerations

### Potential Enhancements
- **Culling feed**: Variant for archived bookmarks (delete vs restore decisions)
- **Analytics**: Track swipe patterns for algorithm improvements
- **Personalization**: ML-based recommendations based on user behavior
- **Accessibility**: Screen reader support and keyboard alternatives
- **Settings**: Customizable swipe sensitivity and cooldown periods

### Edge Cases Handled
- Users with < 10 eligible bookmarks (feature disabled with friendly message)
- Empty discovery queue (auto-regeneration)
- All bookmarks processed (cooldown period prevents immediate re-selection)
- **All bookmarks recently rediscovered** (special "All Caught Up!" state with reset option)
- Stale queues (persist indefinitely, user can manually refresh)

## Success Metrics

### User Engagement
- Number of bookmarks rediscovered per session
- Swipe action distribution (archive vs skip vs quick actions)
- Feature adoption rate among eligible users

### Content Health
- Reduction in "forgotten" bookmark accumulation
- Increased bookmark organization through rediscovery actions
- User retention and session duration improvements

---

*This document serves as the single source of truth for the Rediscover Feed feature implementation.*
