import { ScjymjNetworkAdapter, type ScjymjSocketPort } from '../../scjymj/network/ScjymjNetworkAdapter';

/** Creator 2.2.2 callback network facade backed by the shared Creator 3.8.8 socket. */
export class BamjNetworkAdapter extends ScjymjNetworkAdapter {
    public constructor(socket: ScjymjSocketPort) { super(socket); }
}
