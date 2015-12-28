#VK album downloader bot.

Fetches all photos from the album in VKontakte social network for the specified person and downloads them into local folder.

Photos stored in the directory with user id. Bot saves list of processed photos into local file in JSON format.
Thus, on next run it process only new photos skipping already downloaded ones.

**New.** Ability to store updates in separate directory with name `update_YYYYMMDD`, where YYYYMMDD is current date.

##Usage

```
node crawler.js -i user_ID
```
Get list of albums for the provided user, where ID is user's ID in VK format e.g. 111111

```
node crawler.js -i user_ID -a album_ID
```
Download album `album_ID` of the user `user_ID` into current directory.

```
node crawler.js -i user_ID -a album_ID -u
```
Download album `album_ID` of the user `user_ID` into current directory in update mode (new photos will be stored in separate directory).