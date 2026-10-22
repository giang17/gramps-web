import {describe, expect, it} from 'vitest'
import {
  birthBounds,
  birthEventHandles,
  dateBounds,
  isOutOfBirthOrder,
  sortByBirth,
} from '../../src/util/childOrder.js'
import {gregorianSdn, julianSdn} from '../../src/gcalendar.js'

// Gramps date object as returned by the API
function date(day, month, year, extra = {}) {
  return {
    calendar: 0,
    modifier: 0,
    quality: 0,
    dateval: [day, month, year, false],
    sortval: year ? gregorianSdn(year, month || 1, day || 1) : 0,
    ...extra,
  }
}

function range(from, to, modifier = 4) {
  return {
    ...date(...from),
    modifier,
    dateval: [...from, false, ...to, false],
  }
}

const sdn = gregorianSdn

describe('dateBounds', () => {
  it('uses a single day for an exact date', () => {
    expect(dateBounds(date(12, 3, 1850))).toEqual([
      sdn(1850, 3, 12),
      sdn(1850, 3, 12),
    ])
  })

  it('covers the whole year for a year-only date', () => {
    expect(dateBounds(date(0, 0, 1850))).toEqual([
      sdn(1850, 1, 1),
      sdn(1850, 12, 31),
    ])
  })

  it('covers the whole month for a month-only date', () => {
    expect(dateBounds(date(0, 2, 1852))).toEqual([
      sdn(1852, 2, 1),
      sdn(1852, 2, 29),
    ])
    expect(dateBounds(date(0, 12, 1850))).toEqual([
      sdn(1850, 12, 1),
      sdn(1850, 12, 31),
    ])
  })

  it('covers a range and a span from start to end', () => {
    const expected = [sdn(1850, 1, 1), sdn(1852, 12, 31)]
    expect(dateBounds(range([0, 0, 1850], [0, 0, 1852], 4))).toEqual(expected)
    expect(dateBounds(range([0, 0, 1850], [0, 0, 1852], 5))).toEqual(expected)
  })

  it('ignores a range that ends before it starts', () => {
    expect(dateBounds(range([0, 0, 1852], [0, 0, 1850]))).toBeNull()
  })

  it.each([
    [1, 'before'],
    [2, 'after'],
    [3, 'about'],
    [6, 'text only'],
    [7, 'from'],
    [8, 'to'],
  ])('ignores modifier %i (%s)', modifier => {
    expect(dateBounds(date(12, 3, 1850, {modifier}))).toBeNull()
  })

  it.each([
    [1, 'estimated'],
    [2, 'calculated'],
  ])('ignores quality %i (%s)', quality => {
    expect(dateBounds(date(12, 3, 1850, {quality}))).toBeNull()
  })

  it('ignores empty and missing dates', () => {
    expect(dateBounds(date(0, 0, 0))).toBeNull()
    expect(dateBounds(undefined)).toBeNull()
  })

  it('uses the Julian calendar for Julian dates', () => {
    expect(dateBounds(date(0, 0, 1700, {calendar: 1}))).toEqual([
      julianSdn(1700, 1, 1),
      julianSdn(1700, 12, 31),
    ])
  })

  it('uses other calendars only for an exact day', () => {
    expect(dateBounds(date(1, 1, 8, {calendar: 3, sortval: 2380000}))).toEqual([
      2380000, 2380000,
    ])
    expect(dateBounds(date(0, 0, 8, {calendar: 3, sortval: 2380000}))).toBe(
      null
    )
  })
})

describe('birthBounds', () => {
  const events = {
    birth: {type: 'Birth', date: date(12, 3, 1850)},
    birthAbout: {type: 'Birth', date: date(0, 0, 1850, {modifier: 3})},
    baptism: {type: 'Baptism', date: date(20, 3, 1850)},
    christening: {type: 'Christening', date: date(21, 3, 1850)},
    census: {type: 'Census', date: date(1, 6, 1851)},
  }
  const ref = (handle, role = 'Primary') => ({ref: handle, role})

  it('uses the birth', () => {
    const person = {
      birth_ref_index: 0,
      event_ref_list: [ref('birth'), ref('baptism')],
    }
    expect(birthBounds(person, events)).toEqual(dateBounds(events.birth.date))
  })

  it('falls back to a baptism if the birth has no usable date', () => {
    const person = {
      birth_ref_index: 0,
      event_ref_list: [ref('birthAbout'), ref('baptism')],
    }
    expect(birthBounds(person, events)).toEqual(dateBounds(events.baptism.date))
  })

  it('falls back to a christening if there is no birth', () => {
    const person = {
      birth_ref_index: -1,
      event_ref_list: [ref('census'), ref('christening')],
    }
    expect(birthBounds(person, events)).toEqual(
      dateBounds(events.christening.date)
    )
  })

  it('ignores a baptism in which the person is not the primary', () => {
    const person = {
      birth_ref_index: -1,
      event_ref_list: [ref('baptism', 'Godparent')],
    }
    expect(birthBounds(person, events)).toBeNull()
  })

  it('returns null without events', () => {
    expect(birthBounds({birth_ref_index: -1, event_ref_list: []}, {})).toBe(
      null
    )
    expect(birthBounds(undefined, events)).toBeNull()
  })
})

describe('birthEventHandles', () => {
  it('collects the birth and primary events once', () => {
    const persons = [
      {
        birth_ref_index: 0,
        event_ref_list: [
          {ref: 'b1', role: 'Unknown'},
          {ref: 'e1', role: 'Primary'},
          {ref: 'w1', role: 'Witness'},
        ],
      },
      {
        birth_ref_index: -1,
        event_ref_list: [
          {ref: 'e1', role: 'Primary'},
          {ref: 'e2', role: 'Primary'},
        ],
      },
      undefined,
    ]
    expect(birthEventHandles(persons)).toEqual(['b1', 'e1', 'e2'])
  })
})

describe('isOutOfBirthOrder', () => {
  const b = (...args) => dateBounds(date(...args))

  it('is false for children in order of birth', () => {
    expect(isOutOfBirthOrder([b(1, 1, 1850), b(1, 1, 1852)])).toBe(false)
  })

  it('is true if an older child follows a younger one', () => {
    expect(isOutOfBirthOrder([b(1, 1, 1852), b(1, 1, 1850)])).toBe(true)
  })

  it('is false for overlapping dates in either order', () => {
    expect(isOutOfBirthOrder([b(0, 0, 1850), b(12, 3, 1850)])).toBe(false)
    expect(isOutOfBirthOrder([b(12, 3, 1850), b(0, 0, 1850)])).toBe(false)
  })

  it('ignores children without a usable date', () => {
    expect(isOutOfBirthOrder([b(1, 1, 1852), null, b(1, 1, 1853)])).toBe(false)
    expect(isOutOfBirthOrder([null, null])).toBe(false)
  })
})

describe('sortByBirth', () => {
  const b = (...args) => dateBounds(date(...args))

  it('sorts children by date of birth', () => {
    expect(
      sortByBirth(
        ['C', 'A', 'B'],
        [b(1, 1, 1854), b(1, 1, 1850), b(0, 0, 1852)]
      )
    ).toEqual(['A', 'B', 'C'])
  })

  it('keeps a child without a usable date in front of its next sibling', () => {
    // a child born in 1951 was added last; the undated child stays between
    // the children born in 1957 and 1960
    expect(
      sortByBirth(
        ['1945', '1957', 'x', '1960', '1951'],
        [b(0, 0, 1945), b(0, 0, 1957), null, b(0, 0, 1960), b(0, 0, 1951)]
      )
    ).toEqual(['1945', '1951', '1957', 'x', '1960'])
    expect(
      sortByBirth(
        ['C', 'x', 'B', 'y', 'A'],
        [b(1, 1, 1854), null, b(1, 1, 1852), null, b(1, 1, 1850)]
      )
    ).toEqual(['y', 'A', 'x', 'B', 'C'])
  })

  it('keeps children without a usable date at the end of the list', () => {
    expect(
      sortByBirth(
        ['B', 'A', 'x', 'y'],
        [b(0, 0, 1852), b(0, 0, 1850), null, null]
      )
    ).toEqual(['A', 'B', 'x', 'y'])
  })

  it('moves a child without a usable date at the top with its next sibling', () => {
    expect(
      sortByBirth(['x', 'B', 'A'], [null, b(0, 0, 1852), b(0, 0, 1850)])
    ).toEqual(['A', 'x', 'B'])
  })

  it('leaves a list without usable dates unchanged', () => {
    expect(sortByBirth(['x', 'y'], [null, null])).toEqual(['x', 'y'])
    expect(sortByBirth([], [])).toEqual([])
  })

  it('keeps the order of twins', () => {
    expect(
      sortByBirth(
        ['T2', 'T1', 'A'],
        [b(5, 5, 1852), b(5, 5, 1852), b(1, 1, 1850)]
      )
    ).toEqual(['A', 'T2', 'T1'])
  })

  it('keeps the order of overlapping dates', () => {
    expect(sortByBirth(['Y', 'D'], [b(0, 0, 1850), b(12, 3, 1850)])).toEqual([
      'Y',
      'D',
    ])
    expect(sortByBirth(['D', 'Y'], [b(12, 3, 1850), b(0, 0, 1850)])).toEqual([
      'D',
      'Y',
    ])
  })

  it('puts a child before a later sibling across an overlapping one', () => {
    // "1852" overlaps both others, but 10 Jan must still come before 1 May
    expect(
      sortByBirth(
        ['May', 'Year', 'Jan'],
        [b(1, 5, 1852), b(0, 0, 1852), b(10, 1, 1852)]
      )
    ).toEqual(['Year', 'Jan', 'May'])
  })

  it('returns the same item objects and leaves the input unchanged', () => {
    const items = [{ref: 'b'}, {ref: 'a'}]
    const result = sortByBirth(items, [b(1, 1, 1852), b(1, 1, 1850)])
    expect(result[0]).toBe(items[1])
    expect(result[1]).toBe(items[0])
    expect(items[0].ref).toBe('b')
  })
})
