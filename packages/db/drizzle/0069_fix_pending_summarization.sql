UPDATE bookmarks SET `summarizationStatus` = NULL WHERE `summarizationStatus` = 'pending' and `bookmarks`.`type` != 'link';
