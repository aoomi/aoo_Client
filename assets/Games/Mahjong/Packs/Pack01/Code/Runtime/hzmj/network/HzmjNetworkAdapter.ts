import { ScjymjNetworkAdapter, type ScjymjSocketPort } from '../../../../../../../../Common/Code/Runtime/CompatibilityApp/scjymj/network/ScjymjNetworkAdapter';

/** Callback-style Creator 2.2.2 HZMJ network facade backed by the shared 3.8.8 socket lifecycle. */
export class HzmjNetworkAdapter extends ScjymjNetworkAdapter {
    public constructor(socket: ScjymjSocketPort) {
        super(socket);
    }
}
