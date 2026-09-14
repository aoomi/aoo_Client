import { isValid, Node } from 'cc';
import { RoomSafetyGateway, type ReportCategory } from './RoomSafetyGateway';
import { RoomSafetyReportView } from './RoomSafetyReportView';

interface ReportRequest {
    readonly roomId?: number;
    readonly targetPlayerId?: number;
    readonly category: ReportCategory;
    readonly detail: string;
}

export class RoomSafetyController {
    private readonly view: RoomSafetyReportView;
    private readonly onSubmit = (request: ReportRequest): void => { void this.submit(request); };

    public constructor(
        private readonly node: Node,
        private readonly gateway: RoomSafetyGateway,
        private readonly reportError: (error: unknown) => void,
    ) {
        this.view = new RoomSafetyReportView(node, this.onSubmit);
    }

    public install(): void {
        this.node.on('aoo-room-report-submit', this.onSubmit);
    }

    public open(roomId?: number, targetPlayerId?: number): void {
        this.view.open(roomId, targetPlayerId);
    }

    public destroy(): void {
        this.view.close();
        if (isValid(this.node, true) && (this.node as Node & { _eventProcessor?: unknown })._eventProcessor) {
            this.node.off('aoo-room-report-submit', this.onSubmit);
        }
    }

    private async submit(request: ReportRequest): Promise<void> {
        try {
            const result = await this.gateway.report(request);
            this.view.close();
            this.node.emit('aoo-report-submitted', result);
        } catch (error) {
            this.view.showError(error instanceof Error ? error.message : '举报失败');
            this.node.emit('aoo-report-error', error);
            this.node.emit('aoo-room-safety-error', error);
            this.reportError(error);
        }
    }
}
