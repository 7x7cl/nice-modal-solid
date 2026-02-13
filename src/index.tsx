/* *********************************************************
 * Copyright 2021 eBay Inc.

 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
*********************************************************** */

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @module NiceModal
 * */

import {
  Component,
  createContext,
  createEffect,
  JSX,
  onCleanup,
  onMount,
  ParentComponent,
  splitProps,
  useContext,
  For,
  Show as SolidShow,
} from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';

export interface NiceModalState {
  id: string;
  args?: Record<string, unknown>;
  visible?: boolean;
  delayVisible?: boolean;
  keepMounted?: boolean;
}

export interface NiceModalStore {
  [key: string]: NiceModalState;
}

export interface NiceModalAction {
  type: string;
  payload: {
    modalId: string;
    args?: Record<string, unknown>;
    flags?: Record<string, unknown>;
  };
}

interface NiceModalCallbacks {
  [modalId: string]: {
    resolve: (args: unknown) => void;
    reject: (args: unknown) => void;
    promise: Promise<unknown>;
  };
}

export interface NiceModalHandler<Props = Record<string, unknown>> extends NiceModalState {
  visible: boolean;
  keepMounted: boolean;
  show: (args?: Props) => Promise<unknown>;
  hide: () => Promise<unknown>;
  resolve: (args?: unknown) => void;
  reject: (args?: unknown) => void;
  remove: () => void;
  resolveHide: (args?: unknown) => void;
}

export interface NiceModalHocProps {
  id: string;
  defaultVisible?: boolean;
  keepMounted?: boolean;
}

const symModalId = Symbol('NiceModalId');
const initialState: NiceModalStore = {};
export const NiceModalContext = createContext<NiceModalStore>(initialState);
const NiceModalIdContext = createContext<string | null>(null);

const MODAL_REGISTRY: {
  [id: string]: {
    comp: Component<any>;
    props?: Record<string, unknown>;
  };
} = {};

const ALREADY_MOUNTED: Record<string, boolean> = {};

let uidSeed = 0;
let dispatch: (action: NiceModalAction) => void = () => {
  throw new Error('No dispatch method detected, did you embed your app with NiceModal.Provider?');
};

const getUid = () => `_nice_modal_${uidSeed++}`;

export const reducer = (
  state: NiceModalStore = initialState,
  action: NiceModalAction,
): NiceModalStore => {
  switch (action.type) {
    case 'nice-modal/show': {
      const { modalId, args } = action.payload;
      return {
        ...state,
        [modalId]: {
          ...state[modalId],
          id: modalId,
          args,
          visible: !!ALREADY_MOUNTED[modalId],
          delayVisible: !ALREADY_MOUNTED[modalId],
        },
      };
    }
    case 'nice-modal/hide': {
      const { modalId } = action.payload;
      if (!state[modalId]) return state;
      return {
        ...state,
        [modalId]: {
          ...state[modalId],
          visible: false,
        },
      };
    }
    case 'nice-modal/remove': {
      const { modalId } = action.payload;
      const newState = { ...state };
      delete newState[modalId];
      return newState;
    }
    case 'nice-modal/set-flags': {
      const { modalId, flags } = action.payload;
      return {
        ...state,
        [modalId]: {
          ...state[modalId],
          ...flags,
        },
      };
    }
    default:
      return state;
  }
};

function getModal(modalId: string): Component<any> | undefined {
  return MODAL_REGISTRY[modalId]?.comp;
}

function showModal(modalId: string, args?: Record<string, unknown>): NiceModalAction {
  return {
    type: 'nice-modal/show',
    payload: {
      modalId,
      args,
    },
  };
}

function setModalFlags(modalId: string, flags: Record<string, unknown>): NiceModalAction {
  return {
    type: 'nice-modal/set-flags',
    payload: {
      modalId,
      flags,
    },
  };
}

function hideModal(modalId: string): NiceModalAction {
  return {
    type: 'nice-modal/hide',
    payload: {
      modalId,
    },
  };
}

function removeModal(modalId: string): NiceModalAction {
  return {
    type: 'nice-modal/remove',
    payload: {
      modalId,
    },
  };
}

const modalCallbacks: NiceModalCallbacks = {};
const hideModalCallbacks: NiceModalCallbacks = {};

const getModalId = (modal: string | Component<any>): string => {
  if (typeof modal === 'string') return modal;
  const modalComp = modal as any;
  if (!modalComp[symModalId]) {
    modalComp[symModalId] = getUid();
  }
  return modalComp[symModalId];
};

type NiceModalArgs<T> = T extends Component<infer P> ? P : Record<string, unknown>;

export function show<T extends any, C extends Record<string, unknown>, P extends Partial<NiceModalArgs<Component<C>>>>(
  modal: Component<C>,
  args?: P,
): Promise<T>;

export function show<T extends any>(modal: string, args?: Record<string, unknown>): Promise<T>;
export function show<T extends any, P extends any>(modal: string, args: P): Promise<T>;
export function show(modal: Component<any> | string, args?: Record<string, unknown>) {
  const modalId = getModalId(modal);
  if (typeof modal !== 'string' && !MODAL_REGISTRY[modalId]) {
    register(modalId, modal);
  }

  dispatch(showModal(modalId, args));
  if (!modalCallbacks[modalId]) {
    let theResolve!: (args?: unknown) => void;
    let theReject!: (args?: unknown) => void;
    const promise = new Promise((resolve, reject) => {
      theResolve = resolve;
      theReject = reject;
    });
    modalCallbacks[modalId] = {
      resolve: theResolve,
      reject: theReject,
      promise,
    };
  }
  return modalCallbacks[modalId].promise;
}

export function hide<T>(modal: string | Component<any>): Promise<T>;
export function hide(modal: string | Component<any>) {
  const modalId = getModalId(modal);
  dispatch(hideModal(modalId));
  delete modalCallbacks[modalId];
  if (!hideModalCallbacks[modalId]) {
    let theResolve!: (args?: unknown) => void;
    let theReject!: (args?: unknown) => void;
    const promise = new Promise((resolve, reject) => {
      theResolve = resolve;
      theReject = reject;
    });
    hideModalCallbacks[modalId] = {
      resolve: theResolve,
      reject: theReject,
      promise,
    };
  }
  return hideModalCallbacks[modalId].promise;
}

export const remove = (modal: string | Component<any>): void => {
  const modalId = getModalId(modal);
  dispatch(removeModal(modalId));
  delete modalCallbacks[modalId];
  delete hideModalCallbacks[modalId];
};

const setFlags = (modalId: string, flags: Record<string, unknown>): void => {
  dispatch(setModalFlags(modalId, flags));
};

export function useModal(): NiceModalHandler;
export function useModal(modal: string, args?: Record<string, unknown>): NiceModalHandler;
export function useModal<C extends Record<string, unknown>, P extends Partial<NiceModalArgs<Component<C>>>>(
  modal: Component<C>,
  args?: P,
): Omit<NiceModalHandler, 'show'> & {
  show: (args?: P) => Promise<unknown>;
};

export function useModal(modal?: any, args?: any): any {
  const modals = useContext(NiceModalContext);
  const contextModalId = useContext(NiceModalIdContext);
  let modalId: string | null = null;
  const isUseComponent = modal && typeof modal !== 'string';

  if (!modal) {
    modalId = contextModalId || null;
  } else {
    modalId = getModalId(modal);
  }

  if (!modalId) throw new Error('No modal id found in NiceModal.useModal.');

  const mid = modalId as string;

  createEffect(() => {
    if (isUseComponent && !MODAL_REGISTRY[mid]) {
      register(mid, modal as Component<any>, args);
    }
  });

  return {
    get id() {
      return mid;
    },
    get args() {
      return modals[mid]?.args;
    },
    get visible() {
      return !!modals[mid]?.visible;
    },
    get keepMounted() {
      return !!modals[mid]?.keepMounted;
    },
    show: (nextArgs?: Record<string, unknown>) => show(mid, nextArgs),
    hide: () => hide(mid),
    remove: () => remove(mid),
    resolve: (payload?: unknown) => {
      modalCallbacks[mid]?.resolve(payload);
      delete modalCallbacks[mid];
    },
    reject: (payload?: unknown) => {
      modalCallbacks[mid]?.reject(payload);
      delete modalCallbacks[mid];
    },
    resolveHide: (payload?: unknown) => {
      hideModalCallbacks[mid]?.resolve(payload);
      delete hideModalCallbacks[mid];
    },
  };
}

export const create = <P extends Record<string, unknown>>(
  Comp: Component<P>,
): Component<P & NiceModalHocProps> => {
  return (allProps: P & NiceModalHocProps) => {
    const [local, props] = splitProps(allProps, ['defaultVisible', 'keepMounted', 'id']);
    const modal = useModal(local.id);
    const modals = useContext(NiceModalContext);

    onMount(() => {
      if (local.defaultVisible) {
        modal.show();
      }
      ALREADY_MOUNTED[local.id] = true;
    });

    onCleanup(() => {
      delete ALREADY_MOUNTED[local.id];
    });

    createEffect(() => {
      if (local.keepMounted) setFlags(local.id, { keepMounted: true });
    });

    createEffect(() => {
      const delayVisible = modals[local.id]?.delayVisible;
      if (delayVisible) {
        modal.show(modal.args as Record<string, unknown> | undefined);
      }
    });

    const shouldMount = () => !!modals[local.id];
    const componentArgs = () => modal.args || {};

    return (
      <SolidShow when={shouldMount()}>
        <NiceModalIdContext.Provider value={local.id}>
          <Comp {...((props as unknown) as P)} {...(componentArgs() as any)} />
        </NiceModalIdContext.Provider>
      </SolidShow>
    );
  };
};

export const register = <T extends Component<any>>(
  id: string,
  comp: T,
  props?: Partial<NiceModalArgs<T>>,
): void => {
  if (!MODAL_REGISTRY[id]) {
    MODAL_REGISTRY[id] = { comp, props: props as Record<string, unknown> | undefined };
  } else {
    MODAL_REGISTRY[id].props = props as Record<string, unknown> | undefined;
  }
};

export const unregister = (id: string): void => {
  delete MODAL_REGISTRY[id];
};

const NiceModalPlaceholder: Component = () => {
  const modals = useContext(NiceModalContext);

  const visibleModalIds = () => Object.keys(modals).filter((id) => !!modals[id]);

  createEffect(() => {
    visibleModalIds().forEach((id) => {
      if (!MODAL_REGISTRY[id] && !ALREADY_MOUNTED[id]) {
        console.warn(
          `No modal found for id: ${id}. Please check the id or if it is registered or declared via JSX.`,
        );
      }
    });
  });

  const toRender = () =>
    visibleModalIds()
      .filter((id) => MODAL_REGISTRY[id])
      .map((id) => ({
        id,
        ...MODAL_REGISTRY[id],
      }));

  return (
    <>
      <For each={toRender()}>
        {(item) => {
          const ModalComp = item.comp;
          return <ModalComp id={item.id} {...item.props} />;
        }}
      </For>
    </>
  );
};

const InnerContextProvider: ParentComponent = (props) => {
  const [modals, setModals] = createStore<NiceModalStore>(initialState);
  dispatch = (action: NiceModalAction) => {
    const nextState = reducer(modals, action);
    setModals(reconcile(nextState));
  };

  return (
    <NiceModalContext.Provider value={modals}>
      {props.children}
      <NiceModalPlaceholder />
    </NiceModalContext.Provider>
  );
};

type ProviderProps = {
  dispatch?: (action: NiceModalAction) => void;
  modals?: NiceModalStore;
  children?: JSX.Element;
};

export const Provider: ParentComponent<ProviderProps> = (props) => {
  if (!props.dispatch || !props.modals) {
    return <InnerContextProvider>{props.children}</InnerContextProvider>;
  }

  dispatch = props.dispatch;

  return (
    <NiceModalContext.Provider value={props.modals}>
      {props.children}
      <NiceModalPlaceholder />
    </NiceModalContext.Provider>
  );
};

export const ModalDef: Component<{
  id: string;
  component: Component<any>;
}> = (props) => {
  createEffect(() => {
    register(props.id, props.component);
  });

  onCleanup(() => {
    unregister(props.id);
  });

  return null;
};

export const ModalHolder: Component<{
  modal: string | Component<any>;
  handler: {
    show?: (args?: any) => Promise<unknown>;
    hide?: () => Promise<unknown>;
    [key: string]: any;
  };
  [key: string]: any;
}> = (props) => {
  const [local, restProps] = splitProps(props, ['modal', 'handler']);
  const mid = getUid();
  const ModalComp = typeof local.modal === 'string' ? MODAL_REGISTRY[local.modal]?.comp : local.modal;

  if (!local.handler) {
    throw new Error('No handler found in NiceModal.ModalHolder.');
  }
  if (!ModalComp) {
    throw new Error(`No modal found for id: ${local.modal} in NiceModal.ModalHolder.`);
  }

  local.handler.show = (args: any) => show(mid, args);
  local.handler.hide = () => hide(mid);

  return <ModalComp id={mid} {...restProps} />;
};

export function createModalHandler<T extends Component<any>>(): {
  show: (args?: Omit<NiceModalArgs<T>, keyof NiceModalHocProps>) => Promise<unknown>;
  hide: () => void;
} {
  return Object.create(null);
}

export const antdModal = (
  modal: NiceModalHandler,
): { visible: boolean; onCancel: () => void; onOk: () => void; afterClose: () => void } => {
  return {
    visible: modal.visible,
    onOk: () => modal.hide(),
    onCancel: () => modal.hide(),
    afterClose: () => {
      modal.resolveHide();
      if (!modal.keepMounted) modal.remove();
    },
  };
};

export const antdModalV5 = (
  modal: NiceModalHandler,
): { open: boolean; onCancel: () => void; onOk: () => void; afterClose: () => void } => {
  const { onOk, onCancel, afterClose } = antdModal(modal);
  return {
    open: modal.visible,
    onOk,
    onCancel,
    afterClose,
  };
};

export const antdDrawer = (
  modal: NiceModalHandler,
): { visible: boolean; onClose: () => void; afterVisibleChange: (visible: boolean) => void } => {
  return {
    visible: modal.visible,
    onClose: () => modal.hide(),
    afterVisibleChange: (v: boolean) => {
      if (!v) {
        modal.resolveHide();
      }
      if (!v && !modal.keepMounted) {
        modal.remove();
      }
    },
  };
};

export const antdDrawerV5 = (
  modal: NiceModalHandler,
): { open: boolean; onClose: () => void; afterOpenChange: (visible: boolean) => void } => {
  const { onClose, afterVisibleChange: afterOpenChange } = antdDrawer(modal);
  return {
    open: modal.visible,
    onClose,
    afterOpenChange,
  };
};

export const muiDialog = (
  modal: NiceModalHandler,
): { open: boolean; onClose: () => void; onExited: () => void } => {
  return {
    open: modal.visible,
    onClose: () => modal.hide(),
    onExited: () => {
      modal.resolveHide();
      if (!modal.keepMounted) {
        modal.remove();
      }
    },
  };
};

export const muiDialogV5 = (
  modal: NiceModalHandler,
): { open: boolean; onClose: () => void; TransitionProps: { onExited: () => void } } => {
  return {
    open: modal.visible,
    onClose: () => modal.hide(),
    TransitionProps: {
      onExited: () => {
        modal.resolveHide();
        if (!modal.keepMounted) {
          modal.remove();
        }
      },
    },
  };
};

export const bootstrapDialog = (
  modal: NiceModalHandler,
): { show: boolean; onHide: () => void; onExited: () => void } => {
  return {
    show: modal.visible,
    onHide: () => modal.hide(),
    onExited: () => {
      modal.resolveHide();
      if (!modal.keepMounted) {
        modal.remove();
      }
    },
  };
};

const NiceModal = {
  Provider,
  ModalDef,
  ModalHolder,
  NiceModalContext,
  create,
  register,
  getModal,
  show,
  hide,
  remove,
  useModal,
  reducer,
  antdModal,
  antdDrawer,
  muiDialog,
  bootstrapDialog,
};

export default NiceModal;
