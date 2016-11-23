/* eslint-disable */

export interface UpdateFeedInfoItem {
    buildNumber: string;
    versionString: string;
    dateString: string;
    releaseNotesURL: string;
    downloadURL: string;
    newFeatures: any[];
}

type UpdateFeedInfo = UpdateFeedInfoItem[];

export default UpdateFeedInfo;
