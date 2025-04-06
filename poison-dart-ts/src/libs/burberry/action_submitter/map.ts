/**
 * Action submitter map
 * Ported from Rust crate burberry/src/action_submitter/map.rs
 */

import { ActionSubmitter } from '../types';

/**
 * ActionSubmitterMap - maps actions from one type to another
 */
export class ActionSubmitterMap<A1, A2> implements ActionSubmitter<A1> {
  private submitter: ActionSubmitter<A2>;
  private f: (a: A1) => A2 | null | undefined;

  /**
   * Create a new ActionSubmitterMap
   * @param submitter The submitter to delegate to
   * @param f The mapping function
   */
  constructor(submitter: ActionSubmitter<A2>, f: (a: A1) => A2 | null | undefined) {
    this.submitter = submitter;
    this.f = f;
  }

  /**
   * Submit an action
   * @param action The action to submit
   */
  submit(action: A1): void {
    const mappedAction = this.f(action);
    if (mappedAction !== null && mappedAction !== undefined) {
      this.submitter.submit(mappedAction);
    }
  }
}
