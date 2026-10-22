import {css, html} from 'lit'
import {classMap} from 'lit/directives/class-map.js'
import {mdiSortCalendarAscending} from '@mdi/js'

import {fireEvent} from '../util.js'
import {
  birthBounds,
  birthEventHandles,
  isOutOfBirthOrder,
  sortByBirth,
} from '../util/childOrder.js'
import {renderPersonAvatar, renderPersonDates} from './personListUtils.js'
import {GrampsjsEditableList} from './GrampsjsEditableList.js'
import {getSymbols} from '../symbols.js'
import './GrampsjsFormChildRef.js'
import './GrampsjsFormNewChild.js'
import './GrampsjsTooltip.js'

import '@material/web/list/list-item.js'

export class GrampsjsChildren extends GrampsjsEditableList {
  static get styles() {
    return [
      ...super.styles,
      css`
        md-list-item.highlight {
          opacity: 0.6;
          pointer-events: none;
        }
      `,
    ]
  }

  static get properties() {
    return {
      profile: {type: Array},
      highlightId: {type: String},
      extended: {type: Array},
      _birthEvents: {type: Object, state: true},
    }
  }

  constructor() {
    super()
    this.profile = []
    this.highlightId = ''
    this.extended = []
    this._birthEvents = {}
    this._birthEventsUrl = ''
    this.hasShare = true
    this.hasEdit = true
    this.hasReorder = true
    this.objType = 'ChildRef'
  }

  row(obj, i) {
    const p = this.profile[i] || {}
    const extPerson = this.extended.find(e => e.handle === obj.ref) || null

    const frel = obj.frel || 'Birth'
    const mrel = obj.mrel || 'Birth'
    const hasNonBirthRel = frel !== 'Birth' || mrel !== 'Birth'
    const relText = hasNonBirthRel
      ? `${this._('Father')}: ${this._(frel)} / ${this._('Mother')}: ${this._(
          mrel
        )}`
      : ''

    return html`
      <md-list-item
        type="button"
        class="${classMap({
          selected: i === this._selectedIndex,
          highlight: p.gramps_id === this.highlightId,
        })}"
        @click="${() => {
          if (this.edit) {
            this._handleSelected(i)
          } else {
            this._handleClick(p.gramps_id)
          }
        }}"
      >
        ${p.name_given || ''} ${p.name_surname || ''}
        ${renderPersonDates(
          p,
          getSymbols(this.appState.settings, s => this._(s))
        )}
        ${hasNonBirthRel
          ? html`<span slot="supporting-text">${relText}</span>`
          : ''}
        ${renderPersonAvatar(extPerson, p.sex)}
      </md-list-item>
    `
  }

  _handleClick(grampsId) {
    if (!this.edit && grampsId) {
      fireEvent(this, 'nav', {path: `person/${grampsId}`})
    }
  }

  updated(changed) {
    super.updated(changed)
    if (this.edit && (changed.has('edit') || changed.has('extended'))) {
      this._fetchBirthEvents()
    }
  }

  // load the events with the birth dates of the children (the profile only
  // contains formatted dates)
  async _fetchBirthEvents() {
    const handles = birthEventHandles(this.extended)
    if (this.data.length < 2 || handles.length === 0) {
      this._birthEvents = {}
      return
    }
    const url = `/api/events/?handles=${handles.join(
      ','
    )}&keys=handle,type,date`
    this._birthEventsUrl = url
    const result = await this.appState.apiGet(url)
    if ('data' in result && url === this._birthEventsUrl) {
      this._birthEvents = Object.fromEntries(
        result.data.map(event => [event.handle, event])
      )
    }
  }

  _birthBounds() {
    return this.data.map(childRef =>
      birthBounds(
        this.extended.find(person => person.handle === childRef.ref),
        this._birthEvents
      )
    )
  }

  _renderExtraActionBtns() {
    return html`
      <md-icon-button
        id="btn-sort-birth"
        class="edit"
        ?disabled="${!isOutOfBirthOrder(this._birthBounds())}"
        aria-label="${this._('Sort by date of birth')}"
        @click="${this._handleSortByBirth}"
      >
        <grampsjs-icon
          path="${mdiSortCalendarAscending}"
          color="var(--mdc-theme-secondary)"
        ></grampsjs-icon>
      </md-icon-button>
      <grampsjs-tooltip for="btn-sort-birth"
        >${this._('Sort by date of birth')}</grampsjs-tooltip
      >
    `
  }

  _handleSortByBirth() {
    this._selectedIndex = -1
    fireEvent(this, 'edit:action', {
      action: 'updateProp',
      data: {child_ref_list: sortByBirth(this.data, this._birthBounds())},
    })
  }

  _handleDelete() {
    const obj = this.data[this._selectedIndex]
    if (obj) {
      fireEvent(this, 'edit:action', {action: 'delChildRef', handle: obj.ref})
    }
  }

  _handleUp() {
    const obj = this.data[this._selectedIndex]
    if (obj) {
      fireEvent(this, 'edit:action', {action: 'upChildRef', handle: obj.ref})
      this._updateSelectionAfterReorder(true)
    }
  }

  _handleDown() {
    const obj = this.data[this._selectedIndex]
    if (obj) {
      fireEvent(this, 'edit:action', {action: 'downChildRef', handle: obj.ref})
      this._updateSelectionAfterReorder(false)
    }
  }

  _handleShare() {
    this.dialogContent = html`
      <grampsjs-form-childref
        new
        @object:save="${this._handleChildRefSave}"
        @object:cancel="${this._handleDialogCancel}"
        .appState="${this.appState}"
        objType="${this.objType}"
        dialogTitle=${this._('Add existing child to family')}
      >
      </grampsjs-form-childref>
    `
  }

  _handleEdit() {
    const childRef = this.data[this._selectedIndex]
    if (!childRef) {
      return
    }
    this.dialogContent = html`
      <grampsjs-form-childref
        @object:save="${e => this._handleChildRefEdit(e, this._selectedIndex)}"
        @object:cancel="${this._handleDialogCancel}"
        .appState="${this.appState}"
        .data="${childRef}"
        objType="${this.objType}"
        dialogTitle=${this._('Edit the child reference')}
      >
      </grampsjs-form-childref>
    `
  }

  _handleAdd() {
    this.dialogContent = html`
      <grampsjs-form-new-child
        @object:save="${this._handleNewChildSave}"
        @object:cancel="${this._handleDialogCancel}"
        .appState="${this.appState}"
        dialogTitle="${this._('Add a new person')}"
      >
      </grampsjs-form-new-child>
    `
  }

  _handleNewChildSave(e) {
    fireEvent(this, 'edit:action', {
      action: 'newChild',
      data: e.detail.data,
    })
    e.preventDefault()
    e.stopPropagation()
    this.dialogContent = ''
  }

  _handleChildRefSave(e) {
    fireEvent(this, 'edit:action', {action: 'addChildRef', data: e.detail.data})
    e.preventDefault()
    e.stopPropagation()
    this.dialogContent = ''
  }

  _handleChildRefEdit(e, index) {
    fireEvent(this, 'edit:action', {
      action: 'updateChildRef',
      index,
      data: e.detail.data,
    })
    e.preventDefault()
    e.stopPropagation()
    this.dialogContent = ''
  }

  _handleDialogCancel() {
    this.dialogContent = ''
  }
}

window.customElements.define('grampsjs-children', GrampsjsChildren)
