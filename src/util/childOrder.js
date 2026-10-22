/**
 * Order the children of a family by date of birth.
 *
 * Only dates that pin down a period are used: regular quality, and no
 * modifier or a range/span. A child counts as born before a sibling only if
 * its period ends before the sibling's period begins, so overlapping dates
 * such as "1850" and "1850-03-12" never cause a move. A child without a
 * usable date stays in front of the sibling it was listed before.
 */

import {CALENDARS, gregorianSdn, julianSdn} from '../gcalendar.js'

const MOD_NONE = 0
const MOD_RANGE = 4
const MOD_SPAN = 5
const QUAL_REGULAR = 0

// event types Gramps uses in place of a missing birth (is_birth_fallback)
const BIRTH_FALLBACK_TYPES = ['Stillbirth', 'Baptism', 'Christening']

const TO_SDN = {
  [CALENDARS.GREGORIAN]: gregorianSdn,
  [CALENDARS.JULIAN]: julianSdn,
}

// first and last day (SDN) of a day/month/year triple, null if no year
function partBounds(toSdn, day, month, year) {
  if (!(year > 0)) {
    return null
  }
  if (!month) {
    return [toSdn(year, 1, 1), toSdn(year + 1, 1, 1) - 1]
  }
  if (!day) {
    const next =
      month === 12 ? toSdn(year + 1, 1, 1) : toSdn(year, month + 1, 1)
    return [toSdn(year, month, 1), next - 1]
  }
  const sdn = toSdn(year, month, day)
  return [sdn, sdn]
}

/**
 * First and last possible day (SDN) of a Gramps date, or null if the date
 * cannot be used for ordering.
 */
export function dateBounds(date) {
  if (!date || date.quality !== QUAL_REGULAR) {
    return null
  }
  const {modifier, dateval = []} = date
  if (![MOD_NONE, MOD_RANGE, MOD_SPAN].includes(modifier)) {
    return null
  }
  const toSdn = TO_SDN[date.calendar]
  if (!toSdn) {
    // other calendars: only an exact day, via the precomputed sort value
    const [day, month, year] = dateval
    return modifier === MOD_NONE && day && month && year && date.sortval
      ? [date.sortval, date.sortval]
      : null
  }
  const start = partBounds(toSdn, ...dateval.slice(0, 3))
  if (!start || modifier === MOD_NONE) {
    return start
  }
  const end = partBounds(toSdn, ...dateval.slice(4, 7))
  return end && end[1] >= start[0] ? [start[0], end[1]] : null
}

/**
 * Bounds of a person's birth date, falling back to a stillbirth, baptism or
 * christening in which the person has the primary role.
 */
export function birthBounds(person, eventsByHandle) {
  const refs = person?.event_ref_list ?? []
  const birthRef = refs[person?.birth_ref_index ?? -1]
  const birth = birthRef ? dateBounds(eventsByHandle[birthRef.ref]?.date) : null
  if (birth) {
    return birth
  }
  for (const ref of refs) {
    const event = eventsByHandle[ref.ref]
    if (
      event &&
      ref.role === 'Primary' &&
      BIRTH_FALLBACK_TYPES.includes(event.type)
    ) {
      const bounds = dateBounds(event.date)
      if (bounds) {
        return bounds
      }
    }
  }
  return null
}

/** Handles of the events needed by birthBounds for these persons. */
export function birthEventHandles(persons) {
  const handles = persons.flatMap(person => {
    const refs = person?.event_ref_list ?? []
    return refs
      .filter(
        (ref, i) => i === person.birth_ref_index || ref.role === 'Primary'
      )
      .map(ref => ref.ref)
  })
  return [...new Set(handles)]
}

function isBefore(a, b) {
  return a[1] < b[0]
}

/**
 * Whether a child with a usable date is listed after a sibling born later.
 * `bounds` holds one entry per child, null for children without a usable date.
 */
export function isOutOfBirthOrder(bounds) {
  const dated = bounds.filter(Boolean)
  return dated.some((b, i) =>
    dated.slice(i + 1).some(later => isBefore(later, b))
  )
}

/**
 * Reorder `items` so that no child is listed after a sibling born later.
 *
 * A child without a usable date moves together with the next child that has
 * one, so it stays in front of the sibling it was listed before; children
 * without a usable date at the end of the list stay at the end. Of the
 * children that may come next, the one listed first is taken, so the current
 * order is kept wherever the dates allow it (e.g. for twins or overlapping
 * dates).
 */
export function sortByBirth(items, bounds) {
  const rest = []
  let undated = []
  bounds.forEach((b, i) => {
    if (b) {
      rest.push({items: [...undated, items[i]], bounds: b})
      undated = []
    } else {
      undated.push(items[i])
    }
  })
  const sorted = []
  while (rest.length > 0) {
    const next = rest.findIndex(
      candidate => !rest.some(other => isBefore(other.bounds, candidate.bounds))
    )
    sorted.push(...rest.splice(next, 1)[0].items)
  }
  return [...sorted, ...undated]
}
