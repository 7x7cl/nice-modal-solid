import { render, screen } from '@solidjs/testing-library';
import NiceModal, {
  Provider,
  register,
  unregister,
  reducer,
  antdModal,
  antdModalV5,
  antdDrawer,
  antdDrawerV5,
  muiDialog,
  muiDialogV5,
  bootstrapDialog,
} from './index';

const KNOWN_IDS = ['hoc-test-modal'];

afterEach(() => {
  KNOWN_IDS.forEach((id) => {
    unregister(id);
    try {
      NiceModal.remove(id);
    } catch (e) {
      // noop
    }
  });
});

test('throw error if no provider', () => {
  expect(() => NiceModal.show('test-modal-without-provider')).toThrow(
    'No dispatch method detected, did you embed your app with NiceModal.Provider?',
  );
});

test('provider children is correctly rendered', () => {
  render(() => (
    <Provider>
      <span>learn nice modal</span>
    </Provider>
  ));

  expect(screen.getByText(/learn nice modal/i)).toBeInTheDocument();
});

test('hide an invalid id does nothing', () => {
  render(() => <Provider />);
  expect(() => NiceModal.hide('abc')).not.toThrow();
});

test('there is empty initial state', () => {
  expect(reducer(undefined, { type: 'some-action' })).toEqual({});
});

test('register/unregister modal definition does not throw', () => {
  const DummyModal = () => <div>dummy</div>;
  expect(() => register('hoc-test-modal', DummyModal, { name: 'x' })).not.toThrow();
  expect(() => unregister('hoc-test-modal')).not.toThrow();
});

test('helper adapters map modal state and callbacks', () => {
  const modal = {
    visible: true,
    keepMounted: false,
    hide: jest.fn(),
    resolveHide: jest.fn(),
    remove: jest.fn(),
  };

  const antd = antdModal(modal);
  antd.onOk();
  antd.onCancel();
  antd.afterClose();

  expect(antd.visible).toBe(true);
  expect(modal.hide).toHaveBeenCalledTimes(2);
  expect(modal.resolveHide).toHaveBeenCalledTimes(1);
  expect(modal.remove).toHaveBeenCalledTimes(1);

  const antd5 = antdModalV5(modal);
  expect(antd5.open).toBe(true);

  const drawer = antdDrawer(modal);
  drawer.afterVisibleChange(false);
  expect(modal.resolveHide).toHaveBeenCalledTimes(2);

  const drawer5 = antdDrawerV5(modal);
  expect(drawer5.open).toBe(true);

  const mui = muiDialog(modal);
  mui.onExited();

  const mui5 = muiDialogV5(modal);
  mui5.TransitionProps.onExited();

  const bootstrap = bootstrapDialog(modal);
  bootstrap.onExited();

  expect(modal.remove).toHaveBeenCalled();
});
